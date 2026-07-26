use core::{
    arch::{asm, global_asm},
    sync::atomic::{AtomicBool, Ordering},
};

use crate::{console, sbi};

const SCAUSE_INTERRUPT_BIT: usize = 1usize << (usize::BITS - 1);
const SCAUSE_CODE_MASK: usize = !SCAUSE_INTERRUPT_BIT;
const SCAUSE_BREAKPOINT: usize = 3;

static DEMO_TRAP_HANDLED: AtomicBool = AtomicBool::new(false);

global_asm!(
    r#"
    .section .text.trap
    .align 2
    .global __trap_entry
__trap_entry:
    addi sp, sp, -256
    sd ra, 0(sp)
    sd gp, 8(sp)
    sd tp, 16(sp)
    sd t0, 24(sp)
    sd t1, 32(sp)
    sd t2, 40(sp)
    sd s0, 48(sp)
    sd s1, 56(sp)
    sd a0, 64(sp)
    sd a1, 72(sp)
    sd a2, 80(sp)
    sd a3, 88(sp)
    sd a4, 96(sp)
    sd a5, 104(sp)
    sd a6, 112(sp)
    sd a7, 120(sp)
    sd s2, 128(sp)
    sd s3, 136(sp)
    sd s4, 144(sp)
    sd s5, 152(sp)
    sd s6, 160(sp)
    sd s7, 168(sp)
    sd s8, 176(sp)
    sd s9, 184(sp)
    sd s10, 192(sp)
    sd s11, 200(sp)
    sd t3, 208(sp)
    sd t4, 216(sp)
    sd t5, 224(sp)
    sd t6, 232(sp)

    csrr a0, scause
    csrr a1, sepc
    csrr a2, stval
    call {handler}

    ld ra, 0(sp)
    ld gp, 8(sp)
    ld tp, 16(sp)
    ld t0, 24(sp)
    ld t1, 32(sp)
    ld t2, 40(sp)
    ld s0, 48(sp)
    ld s1, 56(sp)
    ld a0, 64(sp)
    ld a1, 72(sp)
    ld a2, 80(sp)
    ld a3, 88(sp)
    ld a4, 96(sp)
    ld a5, 104(sp)
    ld a6, 112(sp)
    ld a7, 120(sp)
    ld s2, 128(sp)
    ld s3, 136(sp)
    ld s4, 144(sp)
    ld s5, 152(sp)
    ld s6, 160(sp)
    ld s7, 168(sp)
    ld s8, 176(sp)
    ld s9, 184(sp)
    ld s10, 192(sp)
    ld s11, 200(sp)
    ld t3, 208(sp)
    ld t4, 216(sp)
    ld t5, 224(sp)
    ld t6, 232(sp)
    addi sp, sp, 256
    sret
    "#,
    handler = sym rust_trap_handler,
);

unsafe extern "C" {
    fn __trap_entry();
}

/// Install the direct-mode S-mode trap entry.
pub fn init() {
    DEMO_TRAP_HANDLED.store(false, Ordering::Relaxed);
    // SAFETY: __trap_entry is an aligned assembly routine in this kernel image.
    // Writing stvec with its address installs direct-mode S-mode trap handling.
    unsafe {
        asm!(
            "csrw stvec, {entry}",
            entry = in(reg) __trap_entry as *const () as usize,
            options(nostack)
        );
    }
    console::print_line("[Lab2] trap entry installed");
}

/// Trigger one controlled breakpoint exception for the Lab2 smoke test.
pub fn trigger_demo_exception() {
    console::print_line("[Lab2] triggering breakpoint exception");
    // SAFETY: stvec has been installed by init(), and the trap handler advances
    // sepc by the 4-byte instruction length before returning with sret.
    unsafe {
        asm!(".4byte 0x00100073", options(nostack));
    }
}

/// Return whether the Lab2 demo trap reached the Rust handler.
pub fn was_demo_handled() -> bool {
    DEMO_TRAP_HANDLED.load(Ordering::Relaxed)
}

extern "C" fn rust_trap_handler(scause: usize, sepc: usize, _stval: usize) {
    let is_interrupt = (scause & SCAUSE_INTERRUPT_BIT) != 0;
    let cause_code = scause & SCAUSE_CODE_MASK;

    if !is_interrupt && cause_code == SCAUSE_BREAKPOINT {
        console::print_line("[Lab2] trap: breakpoint exception");
        DEMO_TRAP_HANDLED.store(true, Ordering::Relaxed);
        write_sepc(sepc + 4);
        return;
    }

    console::print_line("[Lab2] trap: unexpected cause");
    sbi::shutdown();
}

fn write_sepc(value: usize) {
    // SAFETY: The handler updates sepc to the next instruction after a known
    // 4-byte breakpoint instruction so sret can resume normal kernel flow.
    unsafe {
        asm!("csrw sepc, {value}", value = in(reg) value, options(nostack));
    }
}
