# Admin Mobile iOS Resume Plan

Last updated: July 29, 2026

## Purpose

This document records the current state of the Velle Admin Expo application and
the remaining iPhone setup work. The native iOS connection and distribution work
is intentionally paused; web and backend development can continue independently.

## Current status

- The Expo app lives in `admin-mobile`.
- Expo SDK 54, React 19.1.0, and React Native 0.81.5 are installed.
- Expo Router dependencies and `expo-dev-client` are installed.
- `npx expo-doctor` passes all 18 checks.
- `npm run typecheck` passes.
- The EAS project is linked successfully:
  - Owner: `tacleofficial-1`
  - Project: `velle-admin`
  - Project ID: `e83debed-54a7-4b19-9a5f-7dd1637305cc`
- The iOS staging bundle identifier is
  `com.velleresearch.admin.staging`.
- `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are configured in the EAS
  `development` and `preview` environments.
- The EAS `production` environment has intentionally not been configured.
- No successful signed iOS build or TestFlight build has been created.
- A paid Apple Developer Program membership is not currently available.

## Current blocker

An EAS development build for a physical iPhone and all TestFlight distribution
require Apple signing credentials from an active Apple Developer Program
membership.

Expo Go is the temporary development path. LAN mode starts successfully on the
computer, but the iPhone has not yet connected to Metro. Expo's ngrok tunnel
fallback also fails before bundling with:

```text
CommandError: TypeError: Cannot read properties of undefined (reading 'body')
```

At the time of diagnosis:

- ngrok's public status page reported all systems operational;
- the computer could reach ngrok and Expo over port 443;
- Expo had installed `@expo/ngrok` 4.1.3;
- that package contained the obsolete ngrok agent 2.3.41;
- current Expo reports show the same failure with the shared/legacy ngrok
  tunnel path.

This is a tunnel-layer problem, not a Velle application rendering error.

## Resume path A: Expo Go over LAN

Use this path to test navigation, layout, and Supabase-backed features without
an Apple Developer membership.

1. Connect the iPhone and computer to the same ordinary Wi-Fi network. Avoid
   guest Wi-Fi, client-isolated networks, and active VPNs.
2. If necessary, connect the computer to the iPhone's Personal Hotspot to place
   both devices on a simple shared network.
3. Start Expo:

   ```powershell
   Set-Location C:\Projects\js-healthservices2.0\admin-mobile
   npm install
   npx expo-doctor
   npm run typecheck
   npx expo start --go --lan --clear
   ```

4. Find the computer's active IPv4 address:

   ```powershell
   Get-NetIPConfiguration |
     Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq "Up" } |
     Select-Object InterfaceAlias, @{Name="IPv4"; Expression={$_.IPv4Address.IPAddress}}
   ```

5. On the iPhone, open `http://<IPv4>:8081/status` in Safari. Continue only if
   it displays `packager-status:running`.
6. Open Expo Go and scan the LAN QR code.
7. Expect the Velle Admin home screen with the heading “Payment review,
   wherever you are.”

If the status URL fails, diagnose the router/client-isolation or Windows
firewall path before changing application code.

## Resume path B: retry Expo tunnel later

Retry only after Expo updates its tunnel integration or confirms the service
issue is resolved:

```powershell
Set-Location C:\Projects\js-healthservices2.0\admin-mobile
npx expo start --go --tunnel --clear
```

Do not repeatedly reinstall `@expo/ngrok`, patch generated files inside
`node_modules`, or force-upgrade the Expo SDK solely to work around this error.
Any Expo SDK upgrade must follow the Expo compatibility process and pass Expo
Doctor and TypeScript checks.

## Resume path C: signed iPhone and TestFlight builds

After obtaining an active Apple Developer Program membership:

1. Confirm the Apple account and legal owner that should publish the admin app.
2. Create a physical-device development build:

   ```powershell
   Set-Location C:\Projects\js-healthservices2.0\admin-mobile
   npx eas-cli build --platform ios --profile development
   ```

3. When asked whether the app only uses standard/exempt encryption, answer
   **Yes**. The app currently uses ordinary HTTPS/TLS and platform storage, not
   proprietary cryptography.
4. Register the intended iPhone and allow EAS to create the development
   certificate and provisioning profile.
5. Install the resulting build and run Metro with:

   ```powershell
   npx expo start --dev-client
   ```

6. Test native notification permissions, device-token registration, secure
   storage, deep links, sign-out revocation, and AAL2-protected admin actions on
   a physical iPhone.
7. Add a separate store-distribution staging profile before the first TestFlight
   build. Do not reuse the internal `preview` profile for TestFlight.
8. Configure production EAS variables only after staging validation and the
   production Supabase project are ready.

## Known Expo Go limitation

Expo Go can be used for screens, routing, most Supabase work, and general UI
development. Remote push notifications cannot be tested in Expo Go. Push-token
registration and end-to-end notification delivery must wait for a signed
development build.

## Repository hygiene completed

The root `.gitignore` now ignores nested `node_modules` directories. The
previously tracked `admin-mobile/node_modules` tree was removed from Git's index
without deleting the installed local files. When committing this cleanup,
include the dependency manifests and the staged generated-file removals
together.

## Completion criteria

This paused work is complete when:

- the admin app installs on a physical iPhone under the staging bundle ID;
- Supabase authentication and authorized admin data load successfully;
- push permission and device registration succeed;
- a test notification opens only an allowlisted admin route;
- TestFlight staging installs and passes the physical-device test checklist;
- no production credential or production ordering feature is enabled
  prematurely.
