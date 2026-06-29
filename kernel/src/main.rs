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
    if memory::lab4_address_pte_stage_is_complete() {
        console::print_line("[Lab4-T1] address and PTE ready");
        console::print_line("[Lab4-T1] PASS");
    } else {
        console::print_line("[Lab4-T1] TODO: implement Sv39 address and PTE helpers");
    }

    if memory::lab4_page_table_stage_is_complete() {
        console::print_line("[Lab4-T2] page table maps");
        console::print_line("[Lab4-T2] PASS");
    } else {
        console::print_line("[Lab4-T2] TODO: implement page table map and translate");
    }

    if memory::run_lab4_starter_checks() {
        console::print_line("[Lab4] TODO: implement Sv39 page table mapping");
    } else {
        console::print_line("[Lab4] TODO: complete Sv39 page table interfaces");
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
