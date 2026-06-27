#![no_std]
#![no_main]

mod boot;
mod console;
mod memory;
mod sbi;
mod syscall;
mod task;
mod trap;
mod user;

use core::panic::PanicInfo;

use crate::memory::FrameAllocator;

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
    run_lab4();
    run_lab5();
    run_lab6();
    sbi::shutdown()
}

fn run_lab4() {
    console::print_line("[Lab4] start");
    let mut allocator = memory::StackFrameAllocator::new();
    allocator.init(memory::kernel_end().ceil(), memory::PHYS_MEMORY_END.floor());
    console::print_line("[Lab4] allocator ready");

    let layout = memory::kernel_memory_layout();
    let mut memory_set = match memory::MemorySet::new(allocator) {
        Ok(memory_set) => memory_set,
        Err(_) => {
            console::print_line("[Lab4] FAIL: could not allocate root page table");
            return;
        }
    };
    console::print_line("[Lab4] root page table allocated");

    let text_flags =
        memory::PTEFlags::V | memory::PTEFlags::R | memory::PTEFlags::X | memory::PTEFlags::A;
    let rodata_flags = memory::PTEFlags::V | memory::PTEFlags::R | memory::PTEFlags::A;
    let data_flags = memory::PTEFlags::V
        | memory::PTEFlags::R
        | memory::PTEFlags::W
        | memory::PTEFlags::A
        | memory::PTEFlags::D;

    if memory_set
        .map_identity_range(layout.text_start, layout.text_end, text_flags)
        .is_err()
    {
        console::print_line("[Lab4] FAIL: text mapping failed");
        return;
    }
    console::print_line("[Lab4] text mapped");
    if memory_set
        .map_identity_range(layout.rodata_start, layout.rodata_end, rodata_flags)
        .is_err()
    {
        console::print_line("[Lab4] FAIL: rodata mapping failed");
        return;
    }
    console::print_line("[Lab4] rodata mapped");
    if memory_set
        .map_identity_range(layout.data_start, layout.data_end, data_flags)
        .is_err()
    {
        console::print_line("[Lab4] FAIL: data mapping failed");
        return;
    }
    console::print_line("[Lab4] data mapped");
    if memory_set
        .map_identity_range(layout.bss_start, layout.bss_end, data_flags)
        .is_err()
    {
        console::print_line("[Lab4] FAIL: bss mapping failed");
        return;
    }
    console::print_line("[Lab4] bss mapped");

    let user_layout = user::demo_user_layout();
    let user_text_flags = memory::PTEFlags::V
        | memory::PTEFlags::U
        | memory::PTEFlags::R
        | memory::PTEFlags::X
        | memory::PTEFlags::A;
    let user_stack_flags = memory::PTEFlags::V
        | memory::PTEFlags::U
        | memory::PTEFlags::R
        | memory::PTEFlags::W
        | memory::PTEFlags::A
        | memory::PTEFlags::D;
    if memory_set
        .map_identity_range(
            user_layout.text_start,
            user_layout.text_end,
            user_text_flags,
        )
        .is_err()
    {
        console::print_line("[Lab4] FAIL: user text mapping failed");
        return;
    }
    if memory_set
        .map_identity_range(
            user_layout.stack_start,
            user_layout.stack_end,
            user_stack_flags,
        )
        .is_err()
    {
        console::print_line("[Lab4] FAIL: user stack mapping failed");
        return;
    }
    console::print_line("[Lab4] user pages mapped");

    let test_ppn = match memory_set.alloc_data_frame() {
        Ok(ppn) => ppn,
        Err(_) => {
            console::print_line("[Lab4] FAIL: could not allocate test frame");
            return;
        }
    };
    if memory_set
        .map(
            memory::virtual_address::VirtPageNum::new(test_ppn.value()),
            test_ppn,
            data_flags,
        )
        .is_err()
    {
        console::print_line("[Lab4] FAIL: test page mapping failed");
        return;
    }

    let runtime = memory::Lab4Runtime::new(memory_set, test_ppn);
    console::print_line("[Lab4] page table built");
    let _satp = runtime.activate();
    console::print_line("[Lab4] satp activated");
    console::print_line("[Lab4] paging is active");
    if runtime.verify_after_activation() {
        console::print_line("[Lab4] map/translate test passed");
        console::print_line("[Lab4] PASS");
    } else {
        console::print_line("[Lab4] FAIL: map/translate test failed");
    }
}

fn run_lab5() {
    console::print_line("[Lab5] start");
    task::reset_global_manager();

    let setup_result = task::spawn_kernel_task(task::TaskId::new(0), lab5_task_a)
        .and_then(|_| task::spawn_kernel_task(task::TaskId::new(1), lab5_task_b))
        .and_then(|_| task::spawn_kernel_task(task::TaskId::new(2), lab5_task_c));

    if setup_result.is_err() || !task::starter_interfaces_are_present() {
        console::print_line("[Lab5] FAIL: scheduler initialization failed");
        return;
    }

    console::print_line("[Lab5] scheduler initialized");
    match task::run_ready_tasks() {
        Ok(()) => {
            console::print_line("[Lab5] scheduler finished");
            console::print_line("[Lab5] PASS");
        }
        Err(_) => console::print_line("[Lab5] FAIL: scheduler stopped unexpectedly"),
    }
}

extern "C" fn lab5_task_a() -> ! {
    console::print_line("[Lab5] task A step 1");
    lab5_yield_or_exit();
    console::print_line("[Lab5] task A step 2");
    task::exit_current()
}

extern "C" fn lab5_task_b() -> ! {
    console::print_line("[Lab5] task B step 1");
    lab5_yield_or_exit();
    console::print_line("[Lab5] task B step 2");
    task::exit_current()
}

extern "C" fn lab5_task_c() -> ! {
    console::print_line("[Lab5] task C step 1");
    lab5_yield_or_exit();
    console::print_line("[Lab5] task C step 2");
    task::exit_current()
}

fn lab5_yield_or_exit() {
    if task::yield_now().is_err() {
        console::print_line("[Lab5] FAIL: yield failed");
        task::exit_current();
    }
}

fn run_lab6() {
    console::print_line("[Lab6] start");
    if user::starter_interfaces_are_present() && syscall::starter_interfaces_are_present() {
        console::print_line("[Lab6] user runtime initialized");
        user::enter_demo_user();
    } else {
        console::print_line("[Lab6] FAIL: user runtime skeleton check failed");
    }
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
