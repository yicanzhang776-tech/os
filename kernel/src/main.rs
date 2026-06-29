#![no_std]
#![no_main]

mod boot;
mod console;
mod sbi;
mod trap;

use core::panic::PanicInfo;

extern "C" fn kernel_main() -> ! {
    console::print_line("[Lab2] start");
    console::print_line("[Lab1] console is available");
    console::print_line(lab1_success_marker());

    trap::init();
    if trap::is_trap_entry_installed() {
        console::print_line("[Lab2-T1] stvec configured");
        console::print_line("[Lab2-T1] PASS");
    } else {
        console::print_line("[Lab2-T1] TODO: install trap entry in stvec");
    }

    trap::trigger_demo_exception();
    if trap::was_demo_decoded() {
        console::print_line("[Lab2-T2] breakpoint decoded");
        console::print_line("[Lab2-T2] PASS");
    } else {
        console::print_line("[Lab2-T2] TODO: read scause sepc stval");
    }

    if trap::was_demo_handled() {
        console::print_line("[Lab2] breakpoint handled");
        console::print_line(lab2_success_marker());
    } else {
        console::print_line("[Lab2-T3] TODO: advance sepc and return from breakpoint");
    }
    sbi::shutdown()
}

fn lab1_success_marker() -> &'static str {
    "[Lab1] PASS"
}

fn lab2_success_marker() -> &'static str {
    // TODO(LAB2-T3): return the final Lab2 success marker after the demo trap
    // has been handled and the kernel can continue executing.
    "[Lab2] TODO: replace this placeholder with the success marker"
}

#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    console::print_line("[Lab2] kernel panic");
    if let Some(location) = info.location() {
        console::print_line(location.file());
    }
    sbi::shutdown()
}
