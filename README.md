# UnderWater — Reativação de leads

> Também neste repositório: [`assistente/`](assistente/README.md) — **Lumi**, assistente virtual que mora no topo da tela (web + app de computador).

Piloto local baseado no briefing de novembro de 2026. Python 3.12 ou superior, SQLite e interface web sem dependências externas.

## Executar

```bash
cd /workspace/teste
python app.py
```

Abra `http://127.0.0.1:8000` em um navegador **na mesma máquina**. O servidor escuta somente no loopback. `PORT` altera a porta e `UNDERWATER_DB` altera o caminho do banco. O endereço local não é uma prévia pública do ambiente na nuvem. O banco é criado em `data/underwater.db`; essa pasta não entra no Git. Faça backups seguros do arquivo com o serviço parado.

```bash
python -m unittest discover -s tests -v
```

## Funções disponíveis

- Cadastro e importação CSV UTF-8; deduplicação por telefone normalizado com DDI. Use sempre o mesmo padrão internacional. A importação complementa campos vazios e preserva dados existentes e opt-outs. Nenhum país é inferido automaticamente.
- Segmentos, curso, responsável, idioma, experiência, objeção/motivo de perda, previsão, disponibilidade, proposta, matrícula e receita.
- Pontuação explicável de 0 a 100 por sinais em respostas, com pesos editáveis. A classificação por palavras-chave é uma heurística: pode interpretar mal negações e exige revisão humana.
- Mensagens em português, inglês e espanhol, identificação da assistente, contexto do cadastro, novo número opcional e opt-out. Oferta aparece apenas quando aprovada, com curso identificado e campanha Black Friday 2026. O texto livre da oferta deve ser escrito pelo comercial no idioma do destinatário.
- Consentimento e base legal obrigatórios para simulação, limite de 100 contatos distintos no piloto e cadência configurável de até cinco tentativas.
- Registro manual de respostas, cancelamento de retornos após resposta, recusa, opt-out, matrícula ou encaminhamento humano.
- Agenda de retornos, alertas de alta prioridade, trilha de auditoria de alterações e dashboard filtrável por treinamento, período, campanha e responsável. O período usa última interação recebida ou data de criação. Receita contabiliza apenas contatos marcados como matriculados.

Exemplo de CSV, com dados fictícios (não pré-carregados):

```csv
phone,name,course,language,owner,consent,legal_basis,campaign
5511999999999,Carlos,IMCA ROV Introductory,pt,Comercial,1,Autorização fictícia para teste,Black Friday 2026
```

## Limites desta versão

**Não envia mensagens reais, não importa o histórico do aparelho e não utiliza modelo de IA externo.** Mensagens são geradas por regras com campos registrados; não são extraídas informações de conversas nem preenchidos campos comerciais por suposição. As respostas são inseridas manualmente. Agendamentos são lembretes, sem trabalhador de envio automático. Entrega real permanece zero; envios simulados são contados separadamente.

O recurso **Ligar ao Windows / abrir aplicativo** é espelhamento para uso humano, não uma API de WhatsApp/CRM. Este projeto não controla a tela nem automatiza o celular. Não presuma que o espelhamento autoriza coletar históricos ou disparar mensagens.

Antes de produção: identificar o CRM; obter acesso autorizado à API oficial do WhatsApp/provedor; implementar templates aprovados e janela de atendimento, verificação de webhooks, idempotência, reconciliação e status de entrega; configurar modelo de IA e avaliação humana; adicionar autenticação, autorização por função, HTTPS, proteção de dados em repouso, retenção/exclusão e monitoramento. Não exponha este servidor de piloto diretamente à Internet. A auditoria local não é um log imutável de conformidade.

Não há validação de elegibilidade técnica/certificações: encaminhar esses casos ao especialista, sem prometer aprovação. Receita e matrícula são registradas pelo operador; o programa não confirma pagamentos.

Veja `DIAGNOSTICO.md` para o diagnóstico e plano sugerido.
