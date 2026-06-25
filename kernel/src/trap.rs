use crate::console;

pub fn init() {
    console::print_line("[Lab2] trap starter: stvec is not configured yet");
    // TODO(student): install the trap entry with the stvec CSR.
}

pub fn trigger_demo_exception() {
    console::print_line("[Lab2] trap starter: demo exception is not triggered yet");
    // TODO(student): trigger one controlled breakpoint exception after stvec is set.
}

pub fn was_demo_handled() -> bool {
    // TODO(student): return true only after the demo trap is handled correctly.
    false
}
