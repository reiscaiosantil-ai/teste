"""UnderWater pilot CRM. Python 3.12+, no third-party dependencies."""
import csv
import io
import json
import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).parent
DB = os.environ.get('UNDERWATER_DB', str(ROOT / 'data' / 'underwater.db'))

def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def connect():
    Path(DB).parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    return c

def init():
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS leads(id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT DEFAULT '', course TEXT DEFAULT '', language TEXT DEFAULT 'pt', segment TEXT DEFAULT 'sem interesse identificado', status TEXT DEFAULT 'novo', owner TEXT DEFAULT '', objection TEXT DEFAULT '', enrollment_month TEXT DEFAULT '', experience TEXT DEFAULT '', availability TEXT DEFAULT '', next_action TEXT DEFAULT '', consent INTEGER DEFAULT 0, legal_basis TEXT DEFAULT '', opted_out INTEGER DEFAULT 0, proposal INTEGER DEFAULT 0, enrolled INTEGER DEFAULT 0, revenue REAL DEFAULT 0, campaign TEXT DEFAULT 'Black Friday 2026', last_interaction TEXT DEFAULT '', created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, lead_id INTEGER REFERENCES leads(id), direction TEXT, body TEXT, state TEXT, created_at TEXT);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, lead_id INTEGER REFERENCES leads(id), action TEXT, data TEXT, source TEXT, created_at TEXT);
        CREATE TABLE IF NOT EXISTS followups(id INTEGER PRIMARY KEY, lead_id INTEGER REFERENCES leads(id), due_at TEXT, state TEXT DEFAULT 'pendente', created_at TEXT);
        CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT);
        INSERT OR IGNORE INTO settings VALUES(1,'{"offer":"","offer_approved":false,"new_number":"","max_attempts":3,"pilot_limit":100,"weights":{"payment":20,"discount":10,"availability":15,"immediate":20,"proposal":20,"enrollment":25}}');
        ''')

def log(c, lid, action, data, source='operador'):
    c.execute('INSERT INTO audit(lead_id,action,data,source,created_at) VALUES(?,?,?,?,?)', (lid,action,json.dumps(data,ensure_ascii=False),source,now()))

def settings(c):
    return json.loads(c.execute('SELECT data FROM settings WHERE id=1').fetchone()[0])

SIGNALS = {'payment': r'pagamento|parcel|payment|pago', 'discount': r'desconto|discount|descuento', 'availability': r'vagas|availability|cupos', 'immediate': r'imediat|agora|immediate|ahora', 'proposal': r'proposta|proposal|propuesta', 'enrollment': r'matr[ií]cula|contrato|enroll|inscripci[oó]n'}

def enrich(c, row):
    d = dict(row)
    msgs = [dict(x) for x in c.execute('SELECT * FROM messages WHERE lead_id=? ORDER BY id', (d['id'],))]
    incoming = ' '.join(m['body'].lower() for m in msgs if m['direction']=='in')
    weights = settings(c)['weights']
    reasons = [{'signal':key,'points':weights.get(key,0)} for key,pattern in SIGNALS.items() if re.search(pattern,incoming)]
    d.update(score=min(100,sum(x['points'] for x in reasons)), score_reasons=reasons, messages=msgs)
    d['priority'] = 'alta' if d['score']>=60 else 'média' if d['score']>=30 else 'baixa'
    attempts = sum(m['direction']=='out' for m in msgs)
    d['eligible'] = bool(d['consent'] and d['legal_basis'] and not d['opted_out'] and not d['enrolled'] and d['status'] not in ('sem interesse','atendimento humano') and attempts < settings(c)['max_attempts'])
    d['attempts'] = attempts
    return d

def lead(c,lid):
    row = c.execute('SELECT * FROM leads WHERE id=?',(lid,)).fetchone()
    if not row:
        raise ValueError('Contato não encontrado')
    return enrich(c,row)

FIELDS = {'name','course','language','segment','status','owner','objection','enrollment_month','experience','availability','next_action','consent','legal_basis','opted_out','proposal','enrolled','revenue','campaign','last_interaction'}
BOOLS = {'consent','opted_out','proposal','enrolled'}

def clean(data):
    d = {k:v for k,v in data.items() if k in FIELDS}
    for k in BOOLS & d.keys():
        d[k] = int(str(d[k]).lower() in ('1','true','sim','yes'))
    if 'revenue' in d:
        d['revenue'] = float(d['revenue'] or 0)
        if d['revenue'] < 0: raise ValueError('Receita inválida')
    if d.get('language','pt') not in ('pt','en','es'): raise ValueError('Idioma inválido')
    return d

def upsert(c,data,source='cadastro'):
    phone = re.sub(r'\D','',str(data.get('phone','')))
    if not 10 <= len(phone) <= 15: raise ValueError('Informe telefone internacional com DDI (10 a 15 dígitos)')
    d = clean(data)
    old = c.execute('SELECT * FROM leads WHERE phone=?',(phone,)).fetchone()
    if old:
        # Imports only fill blank facts. Explicit operator edits use PATCH.
        d = {k:v for k,v in d.items() if not old[k] and v and k not in BOOLS}
        lid = old['id']
        if d: c.execute('UPDATE leads SET '+','.join(k+'=?' for k in d)+' WHERE id=?',[*d.values(),lid])
    else:
        lid = c.execute('INSERT INTO leads(phone,created_at) VALUES(?,?)',(phone,now())).lastrowid
        if d: c.execute('UPDATE leads SET '+','.join(k+'=?' for k in d)+' WHERE id=?',[*d.values(),lid])
    log(c,lid,'sincronização' if old else 'cadastro',d,source)
    return lead(c,lid)

def draft(c,d):
    s = settings(c)
    name = d['name'] or {'pt':'tudo bem','en':'there','es':'qué tal'}[d['language']]
    course = d['course']
    if d['language']=='en':
        msg=f"Hi, {name}! I'm Sofia, UnderWater's virtual assistant. " + (f"Your registered interest is {course}. " if course else '') + 'Are you still interested in training with us?'
        if s['new_number']: msg += f" This is our new number: {s['new_number']}. Please save it."
    elif d['language']=='es':
        msg=f'¡Hola, {name}! Soy Sofia, asistente virtual de UnderWater. ' + (f'Tu interés registrado es {course}. ' if course else '') + '¿Todavía tienes interés en capacitarte con nosotros?'
        if s['new_number']: msg += f" Nuestro nuevo número es {s['new_number']}. Por favor, guárdalo."
    else:
        msg=f'Olá, {name}! Aqui é a Sofia, assistente virtual da UnderWater. ' + (f'Seu interesse registrado é {course}. ' if course else '') + 'Você ainda tem interesse em iniciar sua formação?'
        if s['new_number']: msg += f" Nosso novo número é {s['new_number']}. Pode salvá-lo?"
    if s['offer_approved'] and s['offer'] and course and d['campaign']=='Black Friday 2026': msg += ' ' + s['offer']
    msg += {'pt':' Para não receber mais mensagens, responda SAIR.','en':' Reply STOP to opt out.','es':' Responde SALIR para no recibir más mensajes.'}[d['language']]
    return msg

def cancel(c,lid):
    c.execute("UPDATE followups SET state='cancelado' WHERE lead_id=? AND state='pendente'",(lid,))

def api(method,path,data):
    with connect() as c:
        if path=='/api/state' and method=='GET':
            leads=[enrich(c,x) for x in c.execute('SELECT * FROM leads ORDER BY id DESC')]
            return {'leads':leads,'settings':settings(c),'followups':[dict(x) for x in c.execute('SELECT f.*,l.name,l.phone FROM followups f JOIN leads l ON l.id=f.lead_id ORDER BY due_at')], 'mode':'simulation'}
        if path=='/api/leads' and method=='POST': return upsert(c,data)
        if path=='/api/import' and method=='POST':
            reader=csv.DictReader(io.StringIO(data.get('csv','')))
            if not reader.fieldnames or 'phone' not in reader.fieldnames: raise ValueError('CSV precisa da coluna phone')
            count=0
            for row in reader:
                upsert(c,row,'importação CSV'); count+=1
                if count>10000: raise ValueError('Limite de 10.000 linhas por importação')
            return {'imported':count}
        if path=='/api/settings' and method=='POST':
            s=settings(c)
            for k in ('offer','offer_approved','new_number','max_attempts','pilot_limit','weights'):
                if k in data: s[k]=data[k]
            if not isinstance(s['offer_approved'],bool): raise ValueError('Aprovação inválida')
            if not isinstance(s['max_attempts'],int) or not 1<=s['max_attempts']<=5: raise ValueError('Cadência deve ter de 1 a 5 tentativas')
            if not isinstance(s['pilot_limit'],int) or not 1<=s['pilot_limit']<=100: raise ValueError('Piloto limitado a 100 contatos')
            if set(s['weights'])!=set(SIGNALS) or any(type(v)!=int or not 0<=v<=100 for v in s['weights'].values()): raise ValueError('Pesos inválidos')
            c.execute('UPDATE settings SET data=? WHERE id=1',(json.dumps(s),)); log(c,None,'configuração',s)
            return s
        m=re.fullmatch(r'/api/leads/(\d+)(?:/(\w+))?',path)
        if m:
            lid=int(m[1]); action=m[2]; d=lead(c,lid)
            if method=='GET' and action=='audit': return [dict(x) for x in c.execute('SELECT * FROM audit WHERE lead_id=? ORDER BY id DESC',(lid,))]
            if method=='PATCH' and not action:
                changes=clean(data)
                if changes:
                    c.execute('UPDATE leads SET '+','.join(k+'=?' for k in changes)+' WHERE id=?',[*changes.values(),lid])
                    log(c,lid,'qualificação',{'before':{k:d[k] for k in changes},'after':changes})
                if changes.get('opted_out') or changes.get('status') in ('sem interesse','atendimento humano') or changes.get('enrolled'): cancel(c,lid)
                return lead(c,lid)
            if method=='POST' and action=='draft': return {'body':draft(c,d),'inferences':[], 'source':'campos registrados no CRM; geração por regras, sem modelo de IA externo'}
            if method=='POST' and action=='send':
                if not d['eligible']: raise ValueError('Contato não elegível: verifique consentimento, base legal, status e cadência')
                total=c.execute("SELECT COUNT(DISTINCT lead_id) FROM messages WHERE direction='out'").fetchone()[0]
                if not d['attempts'] and total>=settings(c)['pilot_limit']: raise ValueError('Limite de contatos do piloto atingido')
                body=draft(c,d)
                c.execute('INSERT INTO messages(lead_id,direction,body,state,created_at) VALUES(?,?,?,?,?)',(lid,'out',body,'simulada',now()))
                c.execute("UPDATE leads SET status='abordado',next_action='Aguardar resposta' WHERE id=?",(lid,))
                log(c,lid,'envio simulado',{'body':body},'simulador')
                return lead(c,lid)
            if method=='POST' and action=='reply':
                body=str(data.get('body','')).strip()
                if not body: raise ValueError('Resposta vazia')
                opt=bool(re.search(r'\b(sair|stop|salir|pare|n[aã]o me contate|n[aã]o quero mensagens)\b',body,re.I))
                refuse=bool(re.search(r'sem interesse|n[aã]o tenho interesse|not interested|no me interesa',body,re.I))
                status='opt-out' if opt else 'sem interesse' if refuse else 'reativado'
                c.execute('INSERT INTO messages(lead_id,direction,body,state,created_at) VALUES(?,?,?,?,?)',(lid,'in',body,'registrada',now()))
                c.execute('UPDATE leads SET status=?,opted_out=?,last_interaction=?,next_action=? WHERE id=?',(status,int(opt or d['opted_out']),now(),'Contato comercial prioritário' if not(opt or refuse) else 'Não contatar',lid))
                cancel(c,lid); log(c,lid,'resposta registrada',{'body':body,'status':status},'conversa informada pelo operador')
                return lead(c,lid)
            if method=='POST' and action=='followup':
                if not d['eligible']: raise ValueError('Contato não elegível para retorno')
                due=datetime.fromisoformat(data.get('due_at','').replace('Z','+00:00'))
                if due.tzinfo is None: raise ValueError('Informe o fuso horário')
                if due<=datetime.now(timezone.utc): raise ValueError('Retorno deve estar no futuro')
                cancel(c,lid)
                c.execute('INSERT INTO followups(lead_id,due_at,created_at) VALUES(?,?,?)',(lid,due.isoformat(),now()))
                log(c,lid,'retorno agendado',{'due_at':due.isoformat()})
                return {'scheduled':True}
        raise ValueError('Operação não encontrada')

class Handler(BaseHTTPRequestHandler):
    def do_GET(self): self.handle_request()
    def do_POST(self): self.handle_request()
    def do_PATCH(self): self.handle_request()
    def handle_request(self):
        path=self.path.split('?')[0]
        if path.startswith('/api/'):
            try:
                length=int(self.headers.get('Content-Length',0))
                if length>2_000_000: raise ValueError('Requisição muito grande')
                if self.command!='GET' and self.headers.get('Sec-Fetch-Site')=='cross-site': raise ValueError('Origem não permitida')
                data=json.loads(self.rfile.read(length)) if length else {}
                result=api(self.command,path,data)
                self.respond(200,json.dumps(result,ensure_ascii=False).encode(),'application/json; charset=utf-8')
            except (ValueError,TypeError,KeyError,OverflowError) as e:
                self.respond(400,json.dumps({'error':str(e)},ensure_ascii=False).encode(),'application/json; charset=utf-8')
            except Exception:
                self.respond(500,b'{"error":"Falha interna ao processar a operacao"}','application/json')
        else:
            routes={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}
            file=ROOT/'static'/routes.get(path,'__missing__')
            if not file.is_file(): self.respond(404,b'Not found','text/plain'); return
            self.respond(200,file.read_bytes(),{'html':'text/html; charset=utf-8','js':'text/javascript; charset=utf-8','css':'text/css; charset=utf-8'}[file.suffix[1:]])
    def respond(self,status,body,mime):
        self.send_response(status); self.send_header('Content-Type',mime); self.send_header('Content-Length',str(len(body))); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(body)

if __name__=='__main__':
    init()
    port=int(os.environ.get('PORT',8000))
    print(f'UnderWater piloto em http://127.0.0.1:{port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
