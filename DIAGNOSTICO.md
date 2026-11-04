# Diagnóstico técnico inicial — UnderWater

## Situação verificada

O repositório estava vazio. O briefing descreve CRM e atendimento por IA existentes, mas seus fornecedores, APIs, permissões e arquitetura ainda não foram informados. O usuário informou que utiliza Ligar ao Windows, na função de abrir aplicativo, para acessar a tela do celular. Esse mecanismo não fornece integração de backend nem comprova acesso a históricos por API.

O piloto implementa uma base própria em SQLite, importação CSV, qualificação manual, mensagens por regras, pontuação, agenda, auditoria e indicadores. Não substitui nem sincroniza automaticamente com um CRM externo. Nenhum envio real foi realizado.

## Mapeamento do briefing

| Área | Entregue no piloto | Dependência para integração completa |
|---|---|---|
| Base e histórico | CSV, deduplicação e respostas manuais | API/exportação autorizada do CRM e histórico disponível |
| Análise inteligente | Score explicável por regras, segmentação manual | Modelo de IA, avaliação de extração e proveniência por campo |
| Reativação | Rascunhos em três idiomas e envio simulado | WhatsApp oficial, templates, janela e consentimento verificável |
| Qualificação | Campos editáveis e trilha de alterações | Extração assistida com revisão e sincronização no CRM |
| Alertas e humano | Alertas no painel e status de encaminhamento | Identificação de usuários, notificações e filas comerciais |
| Follow-up | Agenda local, cadência e cancelamento | Worker idempotente, revalidação no envio e callbacks |
| Dashboard | Indicadores sobre registros locais e filtros | Entrega, bloqueios e conversões reais via eventos oficiais |
| Segurança | Loopback, validação, opt-out e auditoria local | Controle de acesso, criptografia, retenção e governança LGPD |

## Próximos dados necessários

1. Nome e versão do CRM, documentação da API e campos existentes.
2. Titularidade e situação do número WhatsApp, Business Account e provedor oficial, se houver.
3. Disponibilidade de exportação autorizada, consentimentos, retenção e responsáveis comerciais.
4. Condições comerciais aprovadas, requisitos técnicos dos treinamentos e regras de elegibilidade.
5. Canal de alerta e critérios comerciais de score revisados pela equipe.

Credenciais devem ser configuradas em armazenamento seguro, nunca no código nem em mensagens de chat. A conexão do piloto a serviços externos deverá ser implementada e testada depois de identificar esses sistemas.

## Plano e estimativa preliminar

Estimativa de engenharia, não compromisso de prazo; depende de acesso, qualidade dos dados e aprovações externas:

- Diagnóstico das APIs e permissões: 1–3 dias úteis.
- Importação real, mapeamento e reconciliação do CRM: 3–5 dias.
- WhatsApp oficial, webhooks, templates e testes: 3–7 dias, além do prazo externo de aprovação.
- IA com extração estruturada, proveniência e avaliação: 4–8 dias.
- Segurança de produção, worker, monitoramento e alertas: 4–7 dias.
- Piloto controlado com até 100 contatos elegíveis: 3–5 dias de observação e correções.

Antes de expansão, validar precisão dos campos, recusas e cancelamentos, qualidade do score, reclamações e atribuição de receita. A operação de novembro de 2026 depende do cumprimento dessas etapas; a existência do piloto não comprova prontidão para disparos reais.
