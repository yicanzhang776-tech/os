#![no_std]
#![no_main]

mod boot;
mod console;
mod memory;
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
    console::print_line("[Lab3] start");
    if memory::address_stage_is_complete() {
        console::print_line("[Lab3-T1] address types ready");
        console::print_line("[Lab3-T1] PASS");
    } else {
        console::print_line("[Lab3-T1] TODO: implement physical address conversions");
    }

    if memory::allocation_stage_is_complete() {
        console::print_line("[Lab3-T2] allocator can allocate");
        console::print_line("[Lab3-T2] PASS");
    } else {
        console::print_line("[Lab3-T2] TODO: initialize allocator and allocate frames");
    }

    if memory::starter_is_complete() {
        console::print_line("[Lab3] frame allocator ready");
        console::print_line("[Lab3] PASS");
    } else {
        console::print_line("[Lab3] TODO: implement physical frame allocator");
    }
    sbi::shutdown()
}

fn lab1_success_marker() -> &'static str {
    "[Lab1] PASS"
}

fn lab2_success_marker() -> &'static str {
    "[Lab2] PASS"
}

#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    console::print_line("[Lab2] kernel panic");
    if let Some(location) = info.location() {
        console::print_line(location.file());
    }
    sbi::shutdown()
}
