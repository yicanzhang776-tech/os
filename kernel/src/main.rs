#![no_std]
#![no_main]

mod boot;
mod console;
mod sbi;

use core::panic::PanicInfo;

extern "C" fn kernel_main() -> ! {
    console::raw_print_line(lab1_task1_kernel_entered_marker());
    console::raw_print_line(lab1_task1_pass_marker());

    console::print_line("[Lab1-T2] console ready");
    console::print_line("[Lab1-T2] PASS");

    console::print_line("[Lab1] start");
    console::print_line("[Lab1] console ready");
    console::print_line(lab1_success_marker());
    sbi::shutdown()
}

fn lab1_task1_kernel_entered_marker() -> &'static str {
    "[Lab1-T1] kernel entered"
}

fn lab1_task1_pass_marker() -> &'static str {
    "[Lab1-T1] PASS"
}

fn lab1_success_marker() -> &'static str {
    "[Lab1] PASS"
}

#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    console::print_line("[Lab1] kernel panic");
    if let Some(location) = info.location() {
        console::print_line(location.file());
    }
    sbi::shutdown()
}
