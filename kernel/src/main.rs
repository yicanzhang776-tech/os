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
    // TODO(LAB1-T1): after tracing ENTRY(_start) -> boot::_start -> kernel_main,
    // return the Stage 1 marker that proves Rust kernel code is running.
    "[Lab1-T1] TODO: identify kernel entry path"
}

fn lab1_task1_pass_marker() -> &'static str {
    // TODO(LAB1-T1): return the Stage 1 success marker after you can explain
    // why the boot stack is ready before kernel_main uses Rust code.
    "[Lab1-T1] TODO: confirm boot flow"
}

fn lab1_success_marker() -> &'static str {
    // TODO(LAB1-T3): after Stage 1 and Stage 2 pass, return the final Lab1
    // success marker described by the Stage 3 test.
    "[Lab1] TODO: finish boot log and shutdown path"
}

#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    console::print_line("[Lab1] kernel panic");
    if let Some(location) = info.location() {
        console::print_line(location.file());
    }
    sbi::shutdown()
}
