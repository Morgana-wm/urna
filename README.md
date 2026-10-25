# Urna Eletrônica (simulador)

Simulador de urna eletrônica brasileira, de código aberto, hospedado no GitHub Pages.

- **Urna** (`index.html`): Presidente, Governador, Senador e Deputado Federal, com teclado, BRANCO, CORRIGE, CONFIRMA e os sons da urna. Também funciona pelo teclado do computador (números, Enter = CONFIRMA, Backspace = CORRIGE, B = BRANCO).
- **Painel do admin** (`admin.html`): cadastrar candidatos (foto, número, nome, partido, vice), abrir e encerrar a votação, ver a apuração e zerar os votos.
- **Voto secreto**: o voto é gravado numa "cédula" que não tem nenhuma identificação. O registro de que o aparelho já votou fica separado e não guarda o voto.
- **Um voto por aparelho/navegador.**

Todos os arquivos ficam soltos na raiz, sem pastas. Os votos ficam no Firebase (Cloud Firestore, plano gratuito Spark). Só a conta de administrador consegue alterar candidatos e ver a apuração. As regras de segurança do banco (`firestore.rules`) garantem isso, mesmo com o código aberto.

> A `apiKey` do Firebase dentro de `config.js` pode ficar pública, porque ela só identifica o projeto. Quem protege os dados são as regras do `firestore.rules`.

## Como configurar

Veja o passo a passo completo em [COMO-PUBLICAR.md](COMO-PUBLICAR.md).

## Limitações

- O controle de "um voto por aparelho" usa o navegador. Uma aba anônima ou outro navegador conta como outro aparelho. Isto é um simulador e não serve para eleições oficiais.

## Créditos

- Sons da urna: repositório [welyngton/urnaEletronica](https://github.com/welyngton/urnaEletronica) (licença MIT).
- Brasão da República: [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Coat_of_arms_of_Brazil.svg) (domínio público).
