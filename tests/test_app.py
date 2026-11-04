import importlib.util
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timedelta, timezone
spec=importlib.util.spec_from_file_location('app',Path(__file__).parents[1]/'app.py')
app=importlib.util.module_from_spec(spec);spec.loader.exec_module(app)

class PilotTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();app.DB=str(Path(self.tmp.name)/'test.db');app.init()
    def tearDown(self): self.tmp.cleanup()
    def create(self,**kw):
        return app.api('POST','/api/leads',dict(phone='5511999999999',name='Carlos',course='ROV',consent=True,legal_basis='Consentimento registrado pelo operador',**kw))
    def action(self,l,action,**data): return app.api('POST',f"/api/leads/{l['id']}/{action}",data)
    def test_dedup_preserves_facts_and_optout(self):
        l=self.create();app.api('PATCH',f"/api/leads/{l['id']}",{'opted_out':True})
        other=app.api('POST','/api/leads',{'phone':'+55 (11) 99999-9999','name':'Sobrescrever','consent':True})
        self.assertEqual(l['id'],other['id']);self.assertEqual(other['name'],'Carlos');self.assertTrue(other['opted_out'])
    def test_consent_blocks_send(self):
        l=app.api('POST','/api/leads',{'phone':'5511999999999'})
        with self.assertRaises(ValueError): self.action(l,'send')
    def test_offer_requires_approval(self):
        l=self.create();app.api('POST','/api/settings',{'offer':'OFERTA APROVADA'})
        self.assertNotIn('OFERTA APROVADA',self.action(l,'draft')['body'])
        app.api('POST','/api/settings',{'offer_approved':True})
        self.assertIn('OFERTA APROVADA',self.action(l,'draft')['body'])
    def test_score_caps_and_explains(self):
        l=self.create();l=self.action(l,'reply',body='Quero pagamento, desconto, vagas, agora, proposta e matrícula')
        self.assertEqual(l['score'],100);self.assertEqual(len(l['score_reasons']),6)
    def test_reply_cancels_followup(self):
        l=self.create();self.action(l,'followup',due_at=(datetime.now(timezone.utc)+timedelta(days=2)).isoformat());self.action(l,'reply',body='Em janeiro')
        self.assertEqual(app.api('GET','/api/state',{})['followups'][0]['state'],'cancelado')
    def test_optout_blocks_all_contact(self):
        l=self.create();l=self.action(l,'reply',body='SAIR')
        self.assertTrue(l['opted_out']);self.assertFalse(l['eligible'])
        for action in ('send','followup'):
            with self.assertRaises(ValueError): self.action(l,action)
    def test_cadence_limit(self):
        l=self.create()
        for _ in range(3): self.action(l,'send')
        with self.assertRaises(ValueError): self.action(l,'send')
    def test_import_is_atomic(self):
        with self.assertRaises(ValueError): app.api('POST','/api/import',{'csv':'phone,name\n5511999999999,Carlos\nINVALID,Ana'})
        self.assertEqual(app.api('GET','/api/state',{})['leads'],[])
    def test_handoff_cancels_followup(self):
        l=self.create();self.action(l,'followup',due_at=(datetime.now(timezone.utc)+timedelta(days=2)).isoformat())
        l=app.api('PATCH',f"/api/leads/{l['id']}",{'status':'atendimento humano'})
        self.assertFalse(l['eligible']);self.assertEqual(app.api('GET','/api/state',{})['followups'][0]['state'],'cancelado')
    def test_multilingual_identity(self):
        for language in ('pt','en','es'):
            with app.connect() as c:
                self.assertIn('Sofia',app.draft(c,dict(language=language,name='Carlos',course='ROV',campaign='Black Friday 2026')))
    def test_audit_and_revenue(self):
        l=self.create();app.api('PATCH',f"/api/leads/{l['id']}",{'enrolled':True,'revenue':1500})
        a=app.api('GET',f"/api/leads/{l['id']}/audit",{})
        self.assertEqual(a[0]['action'],'qualificação');self.assertIn('1500',a[0]['data'])
    def test_pilot_limit(self):
        app.api('POST','/api/settings',{'pilot_limit':1});l=self.create();self.action(l,'send')
        other=app.api('POST','/api/leads',{'phone':'5521999999999','consent':True,'legal_basis':'Registro autorizado'})
        with self.assertRaises(ValueError): self.action(other,'send')

if __name__=='__main__': unittest.main()
