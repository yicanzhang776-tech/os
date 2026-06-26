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
    if memory::run_lab3_checks() {
        console::print_line("[Lab3] PASS");
    } else {
        console::print_line("[Lab3] FAIL: physical frame allocator check failed");
    }
    console::print_line("[Lab4] start");
    let _lab4_interfaces_ready = memory::run_lab4_starter_checks();
    console::print_line("[Lab4] TODO: implement Sv39 page table mapping");
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
