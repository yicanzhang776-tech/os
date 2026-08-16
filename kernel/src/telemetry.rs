//! Small, line-oriented runtime events for the browser teaching demo.
//!
//! The events deliberately travel through the same SBI console path as other
//! kernel logs. A host-side bridge reads QEMU's serial output and forwards only
//! these tagged lines to the browser. This keeps the teaching signal separate
//! from the visualizer while avoiding a network stack inside the bare-metal
//! kernel.

use crate::console;
use core::fmt;

struct ConsoleWriter;

impl fmt::Write for ConsoleWriter {
    fn write_str(&mut self, value: &str) -> fmt::Result {
        console::print_str(value);
        Ok(())
    }
}

/// Emit one machine-readable teaching event to the QEMU serial console.
pub fn event(lab: &str, step: &str) {
    let _ = os_demo_event::write_event(&mut ConsoleWriter, lab, step);
}
