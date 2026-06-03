# @superlog/expo

OpenTelemetry-based observability SDK for Expo and React Native apps.

This package is in early development. It provides:

- OTLP trace and log export to Superlog
- stable `session.id` on spans, logs, exceptions, navigation, console, and fetch telemetry
- automatic Expo Router navigation telemetry
- automatic global error tracking
- automatic console interception
- automatic fetch/network spans
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

Wrap your root layout once. Everything else is automatic.

```tsx
import { Slot } from "expo-router";
import { SuperlogProvider } from "@superlog/expo";

export default function RootLayout() {
  return (
    <SuperlogProvider
      token={process.env.EXPO_PUBLIC_SUPERLOG_TOKEN!}
      serviceName="my-expo-app"
    >
      <Slot />
    </SuperlogProvider>
  );
}
```

`token` is your Superlog public token, for example `sl_public_...`.

By default the SDK automatically:

- creates and attaches one stable `session.id`
- infers `release` from Expo config as `<slug>@<version>[+<build>]`
- infers `dist` from `expo-updates` update id, falling back to `embedded`
- reads runtime/update metadata from `expo-updates`
- reads platform from React Native `Platform.OS`
- reads git SHA from `EXPO_PUBLIC_GIT_SHA`, `EXPO_PUBLIC_SUPERLOG_GIT_SHA`, or `EAS_BUILD_GIT_COMMIT_HASH` when available
- tracks Expo Router pathnames when `expo-router` is installed
- captures global errors, console calls, and fetch requests

### Optional Overrides

Pass these only when you need to override the automatic values or disable a
specific automatic integration.

```tsx
<SuperlogProvider
  token={process.env.EXPO_PUBLIC_SUPERLOG_TOKEN!}
  serviceName="my-expo-app"
  endpoint="https://intake.superlog.sh"
  environment="production"
  release="my-expo-app@1.2.3"
  dist="production-20260602"
  gitSha="abc123"
  autoTrackRoutes={false}
  autoTrackErrors={false}
  autoTrackConsole={false}
  autoTrackFetch={false}
/>
```

For source map symbolication, the upload command must use the same `release`,
`dist`, and `platform` values as runtime telemetry. The automatic runtime values
are usually enough, but explicit overrides are useful when your release pipeline
already has canonical build metadata.

## Automatic Telemetry

### Sessions

Every SDK instance creates one stable session id for the app process. The SDK
adds `session.id` to every span, log, exception, route change, console event,
and fetch event. You do not need to set it yourself.

### Navigation

When `expo-router` is installed, `SuperlogProvider` tracks pathname changes by
default. Route changes emit a `navigation.route` span and log with:

- `route.name`
- `navigation.from`
- `navigation.to`
- `session.id`

### Errors

Global errors are captured automatically from browser-style `error` and
`unhandledrejection` events when available, plus React Native `ErrorUtils`.
Manual `captureException` is still useful inside known app workflows where you
want to attach extra context.

### Console

`console.log`, `console.info`, `console.warn`, `console.debug`, and
`console.error` are logged automatically. `console.error` with an `Error`
argument is captured as an exception.

### Fetch

`fetch` requests create `http.client` spans automatically. Completed requests
emit status and duration attributes. Failed requests are captured as exceptions
on the active fetch span. Requests to the Superlog intake endpoint are ignored
to avoid telemetry loops.

## App Context

The only common manual setup is the user id after sign-in.

```ts
import { setSuperlogContext, setSuperlogUser } from "@superlog/expo";

setSuperlogUser(userId);
setSuperlogContext({ "tenant.id": tenantId, "feature.flag": "checkout-v2" });
```

Passing `null` to `setSuperlogUser` clears the user id. Context values are
merged into later telemetry.

## Manual Telemetry

Use helpers when you want explicit spans or extra error context around an app
workflow.

```ts
import { captureException, log, trace } from "@superlog/expo";

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

`trace(name, fn)` creates an OTel span and runs `fn(span)` inside its context.
Logs emitted **synchronously** inside the callback attach to the span
automatically. After an `await`, React Native has no ambient async context, so
thread the span explicitly:

```ts
await trace("chat.send", async (span) => {
  log("optimistic_append", "info", {}, { span }); // before await: implicit also works
  await sendMessage();
  log("reply_received", "info", {}, { span });     // after await: pass { span }
});
```

`log(...)` and `captureException(...)` both accept a trailing `{ span }`. Logs
with no span still carry `session.id` and the current `route.name`.

`captureException(error, attrs)` emits an error log with `exception.type`,
`exception.message`, and `exception.stacktrace`. If no span is active, it also
creates a short `exception` span so the error has trace context.

## Source Maps

Build/export your app with source maps, then upload the generated `.map` files.

For an Expo web export:

```sh
npx expo export --platform web --output-dir dist --dump-sourcemap
```

Upload with the same release and optional dist that your app emits at runtime:

```sh
export SUPERLOG_RELEASE=my-expo-app@1.2.3
export SUPERLOG_DIST=production-20260602 # optional

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

If no trace id appears on a custom log, make sure the log is emitted inside
`trace(...)` or pass through an active SDK span. Logs outside a span still
include `session.id`; automatic navigation and fetch telemetry emit trace
context by default.

## Contributing

Source lives at
[github.com/superloglabs/superlog-expo](https://github.com/superloglabs/superlog-expo).
Run the test suite and type/build checks with:

```sh
npm install
npm run check   # test + typecheck + build
```

## License

MIT © Superlog
