#![no_std]
#![no_main]

mod boot;
mod console;
mod sbi;

use core::panic::PanicInfo;

extern "C" fn kernel_main() -> ! {
    console::print_line("[Lab1] start");
    console::print_line("[Lab1] console is available");
    console::print_line(lab1_success_marker());
    sbi::shutdown()
}

fn lab1_success_marker() -> &'static str {
    // TODO(student): after understanding the boot, SBI, and console path,
    // replace this placeholder with the exact success marker "[Lab1] PASS".
    "[Lab1] TODO: replace this placeholder with the success marker"
}

#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    console::print_line("[Lab1] kernel panic");
    if let Some(location) = info.location() {
        console::print_line(location.file());
    }
    sbi::shutdown()
}
