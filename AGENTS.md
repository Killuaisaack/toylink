# AGENTS.md — ToyLink v0.1

## 1. Mission

Build **ToyLink**, a non-commercial, privacy-preserving application layer that lets an adult user explicitly authorize an AI character to control a personally owned compatible haptic device.

ToyLink v0.1 is distributed as a directly installable SillyTavern third-party UI extension and supports two equal first-class device paths:

1. **Intiface Provider** for devices supported by Intiface Central / Buttplug.
2. **Custom BLE Provider** for users who already possess the BLE UUIDs and command bytes for their own device and enter/import a declarative BLE Profile.

ToyLink is the product name. SillyTavern is the v0.1 host; Intiface and Custom BLE are providers. Do not bind core module names or product identity to one provider.

Installation must follow SillyTavern's normal third-party extension flow: the user pastes the ToyLink Git repository URL into **Extensions → Install Extension**. Do not require SSH, terminal commands, manual file copying, a SillyTavern Server Plugin, a second VPS service, Docker, reverse proxy changes, or a separate bridge deployment.

## 2. Topology

SillyTavern is deployed on a VPS. Bluetooth execution happens on the phone or computer physically near the toy.

```text
VPS: SillyTavern + ToyLink extension assets
                         |
                         v
User phone/computer browser: ToyLink Core + Safety Controller
                    |                         |
                    v                         v
          Intiface Provider          Custom BLE Provider
                    |                         |
            local Intiface            Web Bluetooth
                    +------------ BLE --------+
                                  |
                                 toy
```

`127.0.0.1` means the device running the browser, not the VPS. Never route raw BLE through the VPS.

## 3. Non-negotiable principles

1. The human user is always in control.
2. AI control is off on every startup and must be authorized per session.
3. Every non-stop command is bounded by intensity and duration.
4. Every provider must pass through one shared Safety Controller.
5. Connection loss, timeout, page teardown, stale commands, invalid state, or execution errors must fail safe with a best-effort stop.
6. The AI cannot select devices, change endpoints, install adapters, modify limits, send raw BLE bytes, or access credentials.
7. No chat content, device identifiers, BLE traffic, or usage telemetry is uploaded to unrelated services.
8. Do not add covert, background, non-consensual, or unattended remote-control features.
9. Do not distribute vendor APKs, copied vendor source code, secrets, or proprietary assets.
10. Never claim universal BLE compatibility. A device requires Intiface support or a valid user-supplied BLE Profile.

## 4. Version 0.1 required scope

### Host and shared UI

- A client-only SillyTavern third-party UI extension that installs from its Git repository URL and does not modify core files.
- A valid `manifest.json`, browser bundle, stylesheet, and repository layout compatible with SillyTavern's extension installer.
- Commit the browser-ready build artifacts required by SillyTavern's URL installer; do not require users to run `npm install` or a build command.
- Bundle runtime dependencies locally. Do not depend on third-party CDNs.
- No required Server Plugin or separately deployed service.
- A neutral ToyLink Core reusable by future hosts.
- Native SillyTavern tool/function calling where supported.
- A manual test path that works without an LLM.
- Provider selector: `Intiface` or `Custom BLE`.
- Connect, disconnect, scan, stop-scan, refresh, and explicit device selection.
- Connection, device, capability, command, and error status.
- Low-intensity, short-duration test control.
- AI-control toggle, off by default and not persisted.
- Confirmation mode, on by default.
- User limits bounded by absolute code-level limits.
- Large, always-visible emergency-stop control.
- Clear warnings for non-loopback endpoints and unsupported browser features.

### Provider A: Intiface

- Browser WebSocket integration with Intiface Central / Buttplug.
- Default endpoint `ws://127.0.0.1:12345`.
- Configurable `ws://` or `wss://` endpoint entered only through settings UI.
- Runtime device/capability discovery and explicit device selection.
- Vibration and stop only in v0.1.
- Provider disconnect and device removal propagated to ToyLink Core.

### Provider B: Custom BLE

- Runs entirely in the installed ToyLink browser extension using Web Bluetooth.
- Provides a settings UI to paste JSON or import a local JSON file containing a declarative BLE Profile.
- Validates the complete profile before saving or enabling connection.
- Uses the profile only for device filters, service/characteristic selection, bounded byte encoding, write type, vibration, and stop.
- Requires an explicit human gesture for the browser Bluetooth picker.
- Keeps the selected Bluetooth device and GATT objects only in memory.
- Includes a mock profile/device abstraction for automated development without claiming real-device compatibility.
- Does not contain device research, packet capture, APK analysis, decompilation, protocol extraction, or manufacturer-specific reverse-engineering guidance.
- Does not accept executable JavaScript, expressions, URLs, imports, shell commands, or arbitrary callbacks in a BLE Profile.
- Does not download profiles automatically. Import is always a deliberate local user action.

### Quality

- Strict TypeScript and runtime schema validation.
- Deterministic tests with fake providers, fake Web Bluetooth, and fake clocks.
- README plus architecture, BLE Profile format, testing, safety, privacy, and troubleshooting docs.

## 5. Out of scope for v0.1

- ADB control of official apps.
- Vendor cloud APIs and partner accounts.
- Any companion bridge service, public relay, Server Plugin, or extra VPS deployment.
- APK upload, analysis, decompilation, instrumentation, or reverse engineering.
- Packet capture, traffic analysis, protocol inference, or instructions for obtaining proprietary commands.
- Audio, orientation, biometric, or sensor-driven control.
- Rotation, linear motion, multiple active devices, and complex patterns.
- Raw BLE commands entered by ordinary users.
- Executable device adapters or remotely downloaded profile code.
- Built-in manufacturer profile library or profile marketplace.
- Required MCP integration. Preserve a future MCP boundary, but do not implement a full MCP server in v0.1.

Put out-of-scope ideas in `docs/roadmap.md` unless the user explicitly changes scope.

## 6. Repository layout

```text
.
├── AGENTS.md
├── README.md
├── LICENSE
├── package.json
├── manifest.json
├── tsconfig.json
├── src
│   ├── extension/{index,sillytavern,tool-calling}.ts
│   ├── core/{commands,command-schema,coordinator,safety-controller,settings}.ts
│   ├── providers/{toy-provider,intiface-provider,custom-ble-provider}.ts
│   ├── ble-profile/{types,schema,codec}.ts
│   └── ui/{settings-panel,styles}
├── tests
└── docs/{architecture,ble-profile,safety,testing,roadmap}.md
```

Adapt packaging to the chosen SillyTavern template, but preserve module boundaries.

## 7. Provider contract

```ts
export interface ToyDeviceSummary {
  id: string;
  name: string;
  capabilities: { vibrate: boolean };
}

export interface ToyProvider {
  readonly kind: "intiface" | "custom-ble";
  connect(config: { endpoint?: string; bleProfileId?: string }): Promise<void>;
  disconnect(): Promise<void>;
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
  listDevices(): readonly ToyDeviceSummary[];
  selectDevice(deviceId: string): Promise<void>;
  vibrate(intensity: number, durationMs: number, commandId: string): Promise<void>;
  stop(): Promise<void>;
  isConnected(): boolean;
}
```

Do not leak Buttplug objects, BluetoothDevice objects, GATT characteristics, raw bytes, or sockets outside provider modules.

## 8. Command model

```ts
export type ToyCommand =
  | { action: "vibrate"; intensity: number; durationMs: number; commandId: string; createdAt: number }
  | { action: "stop"; commandId: string; createdAt: number };
```

- `intensity` is normalized `0..1`.
- Reject unknown actions/keys, malformed IDs, numeric strings, NaN, Infinity, negatives, missing fields, and stale commands.
- Deduplicate command IDs.
- The AI never supplies provider, endpoint, device ID, raw bytes, BLE Profile, limits, or confirmation preference.
- Never parse arbitrary prose into commands or evaluate model-generated code.

## 9. Safety Controller

```ts
const ABSOLUTE_MAX_INTENSITY = 0.70;
const ABSOLUTE_MAX_DURATION_MS = 10_000;
const DEFAULT_MAX_INTENSITY = 0.35;
const DEFAULT_MAX_DURATION_MS = 3_000;
const COMMAND_FRESHNESS_MS = 15_000;
```

Every vibration command must:

1. Pass runtime validation.
2. Confirm connection, explicit human device selection, and vibration capability.
3. Confirm current-session AI authorization for AI-originated commands.
4. Apply user and absolute limits.
5. Require a click when confirmation mode is enabled.
6. Stop an active command before replacement.
7. Start an unconditional local stop timer.
8. Keep an unconditional browser-local watchdog for both providers.
9. Clear state after stop or failure.

Stop on emergency click, expiry, disconnect, device removal, provider/device change, AI disable, chat/character change, unload, or execution failure after a command may have started.

Stop must be idempotent. Retry failures only a small bounded number of times and show a prominent warning.

## 10. Declarative BLE Profile

A BLE Profile describes commands already known to the user. It is data, not code. Define and validate a versioned schema similar to:

```json
{
  "profileVersion": 1,
  "name": "My device profile",
  "deviceNamePrefix": "Example",
  "serviceUuid": "0000ffe0-0000-1000-8000-00805f9b34fb",
  "writeCharacteristicUuid": "0000ffe1-0000-1000-8000-00805f9b34fb",
  "writeType": "without-response",
  "commands": {
    "stopHex": "550400000000AA",
    "vibrateTemplateHex": "5504000001{intensity_u8}AA"
  }
}
```

Requirements:

- Allow only supported schema versions and known keys.
- Validate UUID syntax, profile name length, device filter length, hex syntax, even hex length, payload size, and required stop/vibrate commands.
- v0.1 allows only a small allowlist of placeholders such as `{intensity_u8}`. No arithmetic expressions or user-defined functions.
- Map normalized intensity to an unsigned byte only after applying Safety Controller limits.
- Require `stopHex`; a profile without a validated stop packet cannot be activated.
- Preview final bytes and require human confirmation before the first low-intensity test.
- Store profiles as local extension settings only after validation; support deletion and export.
- Clearly label imported profiles as user-provided and unverified.
- A successful GATT write is not proof of physical execution.

## 11. Custom BLE provider boundary

```ts
export interface BleProfileCodec {
  validate(profile: unknown): BleProfile;
  encodeVibrate(profile: BleProfile, intensity: number): Uint8Array;
  encodeStop(profile: BleProfile): Uint8Array;
}

export interface WebBluetoothPort {
  requestAndConnect(profile: BleProfile): Promise<void>;
  write(payload: Uint8Array, writeType: BleWriteType): Promise<void>;
  disconnect(): Promise<void>;
}
```

- Keep Web Bluetooth behind an injectable port so tests do not require hardware.
- The provider handles browser capability detection and clear unsupported-browser errors.
- Profile parsing and encoding remain pure and unit-testable.
- No manufacturer-specific algorithms, encryption plugins, checksums expressed as code, or embedded secrets in v0.1.

## 12. Legal/product boundary

ToyLink provides a generic input format and transport implementation only. The project, documentation, examples, issue templates, and maintainers must not solicit or host APKs, packet captures, decompiled code, credentials, proprietary protocol dumps, or instructions for defeating access controls. Users are responsible for supplying BLE Profile values they are legally permitted to use.

Examples and fixtures must be synthetic and clearly marked as non-device profiles. Do not accept manufacturer-specific profile contributions in v0.1.

## 13. SillyTavern and AI integration

Prefer native tool/function calling:

```text
toy_vibrate(intensity: number, duration_ms: integer)
toy_stop()
toy_status()
```

- Execute only finalized calls, not streaming fragments.
- Prevent recursive loops and duplicate execution.
- State human authorization and local limits in tool descriptions.
- Return only coarse sanitized status to the model.
- Never prompt with endpoints, device IDs, adapter details, credentials, or BLE data.
- A strict tagged-JSON fallback may exist only if disabled by default and routed through identical validation and safety.

## 14. Persistence, privacy, and network rules

Persist only provider kind, human-entered Intiface endpoint, validated BLE Profiles, user limits, confirmation preference, and UI preferences.

Do not persist AI authorization, active commands, connection claims, chat text, raw device IDs, captures, or credentials. Startup is disconnected with AI control off.

- Intiface defaults to `ws://127.0.0.1:12345`.
- Warn before non-loopback endpoints.
- Do not disable TLS verification or add open CORS proxies.
- Escape device names and errors.
- No `eval`, `new Function`, unsafe HTML, shell execution, or unvalidated imports.
- Keep dependencies minimal and locked.

## 15. Engineering constraints

- Strict TypeScript and explicit public types.
- Framework-independent core logic.
- Dependency injection for providers, clocks, timers, and confirmation UI.
- Avoid global mutable state.
- Keep provider behavior out of ToyLink Core.
- Never silently swallow exceptions.
- Sanitize user errors; keep detailed local logs secret-free.
- Preserve existing user work and avoid unrelated refactors.
- Never claim compatibility without actual testing.

## 16. Tests

Use fake providers, fake Web Bluetooth, synthetic BLE Profiles, and deterministic clocks. Cover:

- Valid manual and AI vibration.
- Invalid, stale, duplicate, malformed, non-finite, negative, missing, and oversized input.
- User limits plus absolute ceilings.
- AI-disabled and confirmation-cancelled paths.
- Automatic stop and replacement ordering.
- Emergency stop and timer cancellation.
- Provider switch stops/disconnects safely.
- Intiface disconnect/device removal.
- BLE Profile version, UUID, hex, placeholder, payload-size, and required-stop validation.
- Safe `{intensity_u8}` encoding after clamping.
- Web Bluetooth unavailable, picker cancellation, GATT disconnect, and write failure.
- Partial execution failure triggers best-effort stop.
- Repeated stop is safe.
- Startup never restores active/authorized state.

Run type checking, linting when configured, unit tests, integration tests, and the production extension build. Report exact commands/results; never imply skipped checks passed.

## 17. Manual acceptance

- A clean SillyTavern user can paste the Git repository URL into Install Extension, install, reload, and open ToyLink without terminal, build, Server Plugin, or VPS changes.
- UI offers both Intiface and Custom BLE.
- Intiface path connects, discovers, explicitly selects, tests, and stops a supported device.
- Custom path validates/imports a synthetic profile, invokes the browser picker, connects through fake or validated Web Bluetooth, writes a bounded test, and stops.
- Test commands are low and automatically bounded.
- Emergency stop works in ToyLink for both providers.
- AI commands do nothing before session authorization.
- Confirmation is on by default.
- Excessive values are clamped/rejected.
- Disconnect and provider change trigger stop.
- No unrelated service receives chat/device data.

Physical claims must name device, app/firmware version, browser, OS, adapter revision, and test date. Distinguish mocked integration from hardware validation.

## 18. Documentation

README must cover direct Git URL installation, adult-use/consent/safety/privacy, VPS versus browser-local topology, meaning of `127.0.0.1`, Intiface setup, BLE Profile import, HTTPS/Web Bluetooth/WebSocket limitations, compatibility wording, emergency stop, troubleshooting, and development commands.

`docs/ble-profile.md` documents only the declarative schema, validation rules, synthetic example, import/export workflow, and safety limitations. It must not document reverse engineering.

## 19. Codex working protocol

1. Inspect the repository, applicable `AGENTS.md` hierarchy, package manager, template, and tests.
2. Summarize current state and propose the smallest vertical slices.
3. Ask before changing safety-relevant product decisions.
4. Implement in order:
   - shared schema and Safety Controller;
   - fake provider and manual UI;
   - Intiface Provider;
   - BLE Profile schema/codec and fake Web Bluetooth;
   - Custom BLE Provider;
   - SillyTavern AI tools;
   - documentation and verification.
5. Verify each slice before expanding.

At handoff, lead with what works, list changed files/checks, state limitations, distinguish mocks from hardware tests, and never declare a protocol correct until a human validates stop and bounded low-intensity control on the exact device.
