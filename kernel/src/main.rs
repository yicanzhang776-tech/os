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
    trap::trigger_demo_exception();
    if trap::was_demo_handled() {
        console::print_line(lab2_success_marker());
    } else {
        console::print_line("[Lab2] TODO: configure stvec and handle the demo trap");
    }
    sbi::shutdown()
}

fn lab1_success_marker() -> &'static str {
    "[Lab1] PASS"
}

fn lab2_success_marker() -> &'static str {
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
