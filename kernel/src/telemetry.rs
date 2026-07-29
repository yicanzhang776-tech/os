//! Small, line-oriented runtime events for the browser teaching demo.
//!
//! The events deliberately travel through the same SBI console path as other
//! kernel logs. A host-side bridge reads QEMU's serial output and forwards only
//! these tagged lines to the browser. This keeps the teaching signal separate
//! from the visualizer while avoiding a network stack inside the bare-metal
//! kernel.

use crate::console;

/// Emit one machine-readable teaching event to the QEMU serial console.
pub fn event(lab: &str, step: &str) {
    console::print_str("[OS_DEMO] lab=");
    console::print_str(lab);
    console::print_str(" step=");
    console::print_line(step);
}
