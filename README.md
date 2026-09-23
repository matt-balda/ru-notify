# RUNotify

## Descrição

Este projeto nasceu da ideia de informar quais serão os almoços e jantares servidos no RU da UFRGS, principalmente para quem não gosta de filé de peixe empanado. As informações são coletadas no [site da UFRGS](https://www.ufrgs.br/prae/cardapio-restaurante-universitario/).

O app consulta o cardápio toda segunda-feira, às 10h, e avisa em qual dia será servido o seu **pior cardápio** (por exemplo, filé de peixe empanado) e se será no almoço ou na janta. Um novo alerta chega algumas horas antes de cada refeição com esse prato (12h antes, por padrão). Durante a semana, de segunda a sexta-feira, o app também envia notificações com o cardápio de cada refeição.

### Preferências

Na primeira vez que o app é aberto, ele pede:

- o horário da notificação do **almoço** (padrão 11h20) e da **janta** (padrão 17h40);
- o seu **pior cardápio**, escolhido numa lista de pratos principais;
- com quantas horas de **antecedência** avisar do pior cardápio (padrão 12h).

Depois disso, a tela não aparece mais. Para mudar qualquer coisa, basta tocar em **Editar** no quadro "Seus avisos", no topo do cardápio.

A lista de pratos fica num pequeno banco SQLite no próprio aparelho, e cada prato tem um id e um nome. Ela já vem com os pratos principais conhecidos. Toda semana, quando o cardápio é baixado, o app compara os pratos principais da semana com os do banco e acrescenta os que forem novos. Maiúsculas e acentos são ignorados, então "Bife de Frango grelhado" e "Bife de frango grelhado" contam como o mesmo prato. Os pratos novos aparecem na lista com a marca "Novo".

## Como rodar

### Android

Já existe um APK compilado na raiz do repositório ([RUNotify.apk](./RUNotify.apk)), basta instalá-lo no Android.

Se preferir gerar o APK você mesmo:

```bash
npm install
cd android && ./gradlew assembleRelease
```

O APK gerado fica em `android/app/build/outputs/apk/release/app-release.apk`.

### iPhone

Não há um build pronto para iOS (a Apple exige assinatura, então não dá pra distribuir um instalável como o APK). Para rodar, é necessário um Mac com Xcode:

```bash
npm install
cd ios && pod install && cd ..
npm run ios
```