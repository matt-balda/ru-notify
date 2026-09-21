# RUNotify

## Descrição

Este projeto nasceu da ideia de informar quais serão os almoços e jantares servidos no RU da UFRGS, principalmente para quem não gosta de filé de peixe empanado. As informações são coletadas no [site da UFRGS](https://www.ufrgs.br/prae/cardapio-restaurante-universitario/).

O app consulta o cardápio toda segunda-feira, às 10h, e avisa em qual dia será servido filé de peixe empanado e se será no almoço ou no jantar. Durante a semana, de segunda a sexta-feira, também envia notificações sobre as refeições do dia: às 11h20 para o almoço e às 17h40 para o jantar.

Futuramente, após a validação, pretendo adicionar opções para que cada usuário possa personalizar as notificações de almoço e jantar conforme suas preferências. Por enquanto, o app está em fase de experimentação.

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