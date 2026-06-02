# @superlog/expo

OpenTelemetry-based observability SDK for Expo and React Native apps.

This package is in early development. It currently provides:

- OTLP trace and log export to Superlog
- stable `session.id` on spans, logs, and exceptions
- automatic Expo Router navigation telemetry
- manual trace, log, and exception APIs
- Expo app/update/runtime metadata
- source map discovery and upload tooling for Superlog symbolication

## Install

```sh
npm install @superlog/expo
```

The package expects these peer dependencies from a normal Expo app:

- `react`
- `react-native`
- `expo-constants`
- optional: `expo-router`
- optional: `expo-updates`

## Configure

Wrap your root layout once. The SDK creates a stable session id for the app
process and tracks Expo Router pathname changes automatically when
`expo-router` is installed.

```tsx
import { Slot } from "expo-router";
import { SuperlogProvider } from "@superlog/expo";

export default function RootLayout() {
  return (
    <SuperlogProvider
      token={process.env.EXPO_PUBLIC_SUPERLOG_TOKEN!}
      endpoint={process.env.EXPO_PUBLIC_SUPERLOG_ENDPOINT ?? "https://intake.superlog.sh"}
      serviceName="my-expo-app"
      environment={process.env.EXPO_PUBLIC_SUPERLOG_ENVIRONMENT ?? "production"}
      release={process.env.EXPO_PUBLIC_SUPERLOG_RELEASE}
      dist={process.env.EXPO_PUBLIC_SUPERLOG_DIST}
      gitSha={process.env.EXPO_PUBLIC_GIT_SHA}
    >
      <Slot />
    </SuperlogProvider>
  );
}
```

`token` is your Superlog public token, for example `sl_public_...`.

If `release` is omitted, the SDK tries to infer one from Expo config as
`<slug>@<version>[+<build>]`. For source map symbolication, explicitly setting
`EXPO_PUBLIC_SUPERLOG_RELEASE` is safer because your upload command can use the
same value.

## Capture Telemetry

Use the top-level helpers anywhere after the provider has initialized.

```ts
import { captureException, log, setSuperlogUser, trace } from "@superlog/expo";

setSuperlogUser(userId);

await trace("chat.send", async () => {
  log("chat_send_started", "info", { "chat.id": chatId });
  await sendMessage();
});

try {
  await loadThread();
} catch (error) {
  captureException(error, { component: "thread" });
}
```

`trace(name, fn)` creates an OTel span. Logs emitted inside the callback are
attached to the active span context.

`captureException(error, attrs)` emits an error log with `exception.type`,
`exception.message`, and `exception.stacktrace`. If no span is active, it also
creates a short `exception` span so the error has trace context.

## Session And Context

Every SDK instance creates one stable session id for the process lifetime. The
SDK adds `session.id` to every span, log, and exception. Expo Router route
changes also emit `navigation.route` spans and logs with `route.name`,
`navigation.from`, and `navigation.to`.

```ts
import { setSuperlogContext, setSuperlogUser } from "@superlog/expo";

setSuperlogUser(userId);
setSuperlogContext({ "tenant.id": tenantId, "feature.flag": "checkout-v2" });
```

Passing `null` to `setSuperlogUser` clears the user id.

## Expo Router

`SuperlogProvider` auto-tracks Expo Router pathnames by default. If you need to
disable that, pass `autoTrackRoutes={false}`.

For a custom setup that initializes the client manually, mount the route
instrumentation yourself after the SDK has been initialized.

```tsx
import { Slot } from "expo-router";
import { SuperlogExpoRouterInstrumentation } from "@superlog/expo/expo-router";

export default function RootLayout() {
  return (
    <>
      <SuperlogExpoRouterInstrumentation />
      <Slot />
    </>
  );
}
```

## Source Maps

Build/export your app with source maps, then upload the generated `.map` files.

For an Expo web export:

```sh
npx expo export --platform web --output-dir dist --dump-sourcemap
```

Upload with the same release and optional dist that your app emits at runtime:

```sh
export EXPO_PUBLIC_SUPERLOG_RELEASE=my-expo-app@1.2.3
export EXPO_PUBLIC_SUPERLOG_DIST=production-20260602 # optional

SUPERLOG_TOKEN=sl_public_... npx superlog-expo sourcemaps upload \
  --dir dist \
  --project-id <project-id> \
  --platform web
```

The uploader also accepts explicit flags:

```sh
npx superlog-expo sourcemaps upload \
  --dir dist \
  --project-id <project-id> \
  --release my-expo-app@1.2.3 \
  --dist production-20260602 \
  --platform web \
  --token sl_public_...
```

The CLI discovers every `.map` file under `--dir`, computes a SHA-256 hash,
extracts `debugId`/`debug_id` when present, and records the adjacent bundle file
when it can find one.

### Matching Rules

Runtime telemetry should include:

- `service.name`
- `service.version`
- `superlog.release`
- `superlog.dist`, when configured
- `device.platform`
- `expo.update_id`
- `expo.update_group_id`

Uploaded source maps should use the same `release`, `dist`, and `platform`.
Superlog can also fall back to matching the generated bundle filename from the
stack frame, but exact release/dist/platform metadata is the intended path.

## Public API

```ts
import {
  SuperlogProvider,
  captureException,
  discoverSourceMaps,
  getSuperlog,
  initSuperlog,
  log,
  setSuperlogContext,
  setSuperlogUser,
  trace,
  uploadSourceMap,
} from "@superlog/expo";

import { SuperlogExpoRouterInstrumentation } from "@superlog/expo/expo-router";
```

`initSuperlog` and `getSuperlog` are available for apps that need explicit
client lifecycle control. `dsn` is accepted as a deprecated alias for `token`.

`@superlog/expo/testing` exports a fake transport for unit tests.

## Troubleshooting

If source maps upload but stacks remain minified:

- confirm the event has `service.version` or `superlog.release` equal to the
  upload release
- confirm `superlog.dist` matches the upload dist, or omit dist on both sides
- confirm the stack frame bundle filename exists in the uploaded artifact list
- confirm the API can read source map objects from storage

If no trace id appears on a log, make sure the log is emitted inside `trace(...)`
or pass through an active SDK span. Logs outside a span still include
`session.id`, and route changes tracked by the provider emit trace context
automatically.

## Current Limitations

- no automatic global error handler yet
- no automatic console interception yet
- no automatic fetch/network instrumentation yet
- source map upload depends on Superlog's source-map API being enabled
