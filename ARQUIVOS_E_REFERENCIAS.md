# Arquivos, modelos e referências

## Conteúdo do pacote

- `projeto/`: fonte completa consolidada 0.3.4, dois ONNX, requisitos, testes,
  licenças, exemplos herdados e documentação antiga identificada.
- `iniciador_windows/`: EXE corrigido, CMDs, atualizador, fonte Go e licença.
  É material de distribuição/manutenção, não um runtime Python completo.
- `evidencias/`: último print aprovado, amostra de tratamento de 1029.mp4,
  comparações estáticas e dados de validação preservados da entrega 0.3.4.
- `historico/`: contexto original e ZIP inicial com a entrega 0.1/checkpoint
  0.2, além dos documentos da entrega 0.3.4.
- `MANIFESTO_SHA256.json`: integridade dos arquivos da transferência.

## Vídeo principal e portátil completo, fora deste ZIP

Os links abaixo apontam para os arquivos da conta original. O usuário deve
baixá-los e disponibilizá-los ao Codex quando necessário. Não assumir que
outra sessão/ambiente consegue abrir URLs autenticadas ou resolver IDs da Library.

| Arquivo | Uso | Link |
|---|---|---|
| `1029.mp4` | Fonte real principal: 1920 × 1080, 30 FPS, 8872 quadros, 234.628.760 bytes | [Baixar pela conta original](https://chatgpt.com/library?file_id=libfile_8d74a98570c481919ad231dd87b1c3b9&account_id=personal) |
| `ROV_Live_IA_Portatil_Windows_x64.zip` | Runtime Windows completo original 0.3.2, cerca de 208 MB; aplicar atualização depois | [Abrir arquivo](https://chatgpt.com/library?file_id=libfile_ae90542a72c48191afde6e9714876d07&account_id=personal) |

Para desenvolvimento com o vídeo principal, coloque `1029.mp4` em
`projeto/dados/1029.mp4`. Evita transportar novamente centenas de megabytes
só para ler o contexto. Os modelos ONNX necessários já estão incluídos.

O portátil original não é 0.3.4 por si só: é necessário aplicar os módulos
mais recentes. Preservar a instalação funcional e a abertura CMD já confirmada.

## Catálogo histórico de entregas

Estes links preservam as versões mencionadas. Não instalar versões antigas
por engano sobre a mais recente. O histórico não é uma recomendação de rollback.

| Entrega | Papel | Arquivo da conversa |
|---|---|---|
| 0.2 | Dehaze clássico reforçado | [ROV_Live_v0.2.zip](https://chatgpt.com/library?file_id=libfile_2a8bbb2923ec81918461b0eea0caab07&account_id=personal) |
| IA experimental | Prova inicial CLI, não app final | [ROV_IA_Experimental.zip](https://chatgpt.com/library?file_id=libfile_ab15e515230481918efa6752abdfd89e&account_id=personal) |
| 0.3 | Integração WaterNet em vídeo | [ROV_Live_IA_v0.3.zip](https://chatgpt.com/library?file_id=libfile_432fd552c1948191a92451d79dcf7aa7&account_id=personal) |
| 0.3.1 | Proteções no clássico | [ROV_Live_IA_v0.3.1.zip](https://chatgpt.com/library?file_id=libfile_75bef5fe8a188191b29db326690dc13c&account_id=personal) |
| 0.3.2 | Ruído/nitidez; base completa recuperada | [ROV_Live_IA_v0.3.2.zip](https://chatgpt.com/library?file_id=libfile_d3bfada64c508191abbc35590810710c&account_id=personal) |
| 0.3.2a | Saúde da captura independente do tratamento | [ROV_Live_Correcao_0.3.2a.zip](https://chatgpt.com/library?file_id=libfile_7336398b696881918851bfaa9415df42&account_id=personal) |
| 0.3.3 | Correção assíncrona/fluida | [ROV_Live_IA_Atualizacao_0.3.3.zip](https://chatgpt.com/library?file_id=libfile_97dc905649f0819184446acdc71c1879&account_id=personal) |
| Launcher | EXE que chama CMD funcional | [ROV_Live_Correcao_Iniciador.zip](https://chatgpt.com/library?file_id=libfile_3fcf6e958a688191ac27f89d00a51cda&account_id=personal) |
| 0.3.4 | Última atualização entregue, usada nesta consolidação | [ROV_Live_IA_Atualizacao_0.3.4.zip](https://chatgpt.com/library?file_id=libfile_1ff79bc032dc8191b8958944cdce28e8&account_id=personal) |
| Exemplo 0.3.4 | Comparativo offline de 6 s, incluído nas evidências | [ROV_Live_1029_Comparacao_0.3.4.mp4](https://chatgpt.com/library?file_id=libfile_e17e8ede58308191b0c3a54643cd6cf4&account_id=personal) |

## Referência visual anterior

`WhatsApp Video 2026-10-28 at 12.25.38.mp4`, ~32,25 s, 960 × 576, 30 FPS:
gravação de tela de um comparativo com peixes, água verde à esquerda e imagem
corrigida à direita. A entrada dos testes foi a região original, não o lado
já tratado. Não pressupor correspondência perfeita entre pixels dos dois lados.

O recorte usado em testes: aproximadamente `frame[99:449,137:443]`, 350 × 306.
As amostras herdadas da base usam trecho em torno de 12–15 s.
Gravação completa da referência está incluída em `evidencias/REFERENCIA_PEIXES.mp4`.
Origem: [arquivo da conversa](https://chatgpt.com/library?file_id=libfile_833dcb1cd1e88191b1ca79879c260dd2&account_id=personal).

Referência Orphiecam mencionada no contexto original:
https://www.youtube.com/watch?v=lsXASTLiQZY
O material pode combinar câmera/iluminação/óptica/algoritmo diferentes; não
demonstrou que o mesmo sinal turvo produz aquele resultado apenas por software.

Vídeos antigos citados no contexto original (`31904.mp4`, `Meu primeiro
vídeo(1).mp4` e nome longo da mina/YouTube) não foram recuperados nesta
transferência. Seus arquivos e IDs não devem ser inventados. O contexto
histórico original registra exatamente o que havia sido visto ou não.

## Proveniência WaterNet

- Repositório: https://github.com/tnwei/waternet
- Commit registrado: `2091896881fe0dfa5fb96007f29021a6067259cb`.
- Pesos usados na pesquisa:
  https://www.dropbox.com/s/g3ttnbjgi1pjp0v/replicated-waternet-256x256-20220529.pt?dl=1
- Os checkpoints `.pt`, ambiente PyTorch de pesquisa e script original de
  exportação não foram encontrados nos pacotes recuperados. Os ONNX estão
  presentes e permitem reproduzir a inferência atual sem treinar/exportar.
- Código upstream MIT: `projeto/LICENSE_WATERNET.txt`. Preservar atribuição.
- Não houve parecer sobre todas as condições de uso/distribuição de dados e
  pesos para um produto comercial; não tratar este protótipo como prova disso.
- FUnIE-GAN rejeitado: https://github.com/xahidbuffon/FUnIE-GAN

## Referências técnicas consultadas durante a conversa

Catálogo de fontes usadas nas discussões; não é uma revisão nova feita nesta
transferência. Verificar documentação atual se alterar versões/implementação.

- UDCP: https://openaccess.thecvf.com/content_iccv_workshops_2013/W24/html/Drews_Jr._Transmission_Estimation_in_2013_ICCV_paper.html
- Dark channel/guided filter: https://people.csail.mit.edu/kaiming/cvpr09/
- OpenCV VideoIO: https://docs.opencv.org/4.11.0/d4/d15/group__videoio__flags__base.html
- Qt for Python: https://doc.qt.io/qtforpython-6/
- ONNX Runtime DirectML: https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
- Python embutido Windows: https://docs.python.org/3.12/using/windows.html#the-embeddable-package
- UVE-Net/UVEB (pesquisa, não integrado): https://openaccess.thecvf.com/content/CVPR2024/html/Xie_UVEB_A_Large-scale_Benchmark_and_Baseline_Towards_Real-World_Underwater_Video_CVPR_2024_paper.html
- UnDIVE (pesquisa, não integrado): https://openaccess.thecvf.com/content/WACV2025/html/Srinath_UnDIVE_Generalized_Underwater_Video_Enhancement_using_Generative_Priors_WACV_2025_paper.html
- RealBasicVSR (pesquisa, não integrado): https://github.com/ckkelvinchan/RealBasicVSR
- Orphie: https://i2s-orphie.com/en/home
- SeaVision, referência informada pelo usuário: https://www.bmptech.com.br/pt/innovation

Nenhuma dessas referências implica que o pacote use suas redes, tenha suas
licenças automaticamente resolvidas ou alcance os resultados publicados.
