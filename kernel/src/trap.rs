use crate::console;

pub fn init() {
    console::print_line("[Lab2] trap starter: stvec is not configured yet");
    // TODO(LAB2-T1): install the trap entry with the stvec CSR.
}

pub fn is_trap_entry_installed() -> bool {
    // TODO(LAB2-T1): return true only after stvec points to the trap entry.
    false
}

pub fn trigger_demo_exception() {
    console::print_line("[Lab2] trap starter: demo exception is not triggered yet");
    // TODO(LAB2-T2): trigger one controlled breakpoint exception after stvec is set.
}

pub fn was_demo_decoded() -> bool {
    // TODO(LAB2-T2): return true after reading scause, sepc, and stval for the
    // controlled breakpoint exception.
    false
}

pub fn was_demo_handled() -> bool {
    // TODO(LAB2-T3): return true only after sepc is advanced and execution
    // continues after the breakpoint instruction.
    false
}
