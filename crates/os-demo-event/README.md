# os-demo-event

`os-demo-event` is the small `no_std` protocol component used by the teaching
kernel to validate and encode tagged runtime events. It contains no Lab
implementation, student answer, grading rule, file access, process execution,
network access, heap allocation, or external dependency.

The current kernel wire format remains:

```text
[OS_DEMO] lab=<lab> step=<step>\n
```

The browser bridge normalizes that line into `os-demo.event/v1`. The crate
deliberately does not add `status`, `detail`, or `source` to the serial line:
those values continue to be derived by the existing JavaScript parser exactly
as before.

## Public API

- `EVENT_PROTOCOL`: stable browser event protocol name.
- `Lab`: P0, Lab1-Lab7, plus the existing kernel panic source.
- `Event`: validated borrowed event data.
- `EventStatus`: status derived from the tagged step using the current parser
  rule.
- `write_event`: validates and writes one complete event through
  `core::fmt::Write` without allocating.

## Local verification

```sh
HOST_TARGET=$(rustc -vV | sed -n 's/^host: //p')
cargo test -p os-demo-event --target "$HOST_TARGET"
cargo doc -p os-demo-event --no-deps
cargo package -p os-demo-event
```

`cargo publish` is intentionally not part of the project workflow.
