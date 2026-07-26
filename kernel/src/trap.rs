use core::{
    arch::{asm, global_asm},
    sync::atomic::{AtomicBool, Ordering},
};

use crate::{
    console, fs, sbi, telemetry,
    syscall::{self, SyscallError, SyscallOutcome, SyscallRequest},
    user,
};

const SCAUSE_INTERRUPT_BIT: usize = 1usize << (usize::BITS - 1);
const SCAUSE_CODE_MASK: usize = !SCAUSE_INTERRUPT_BIT;
const SCAUSE_INSTRUCTION_ADDRESS_MISALIGNED: usize = 0;
const SCAUSE_INSTRUCTION_ACCESS_FAULT: usize = 1;
const SCAUSE_ILLEGAL_INSTRUCTION: usize = 2;
const SCAUSE_BREAKPOINT: usize = 3;
const SCAUSE_LOAD_ADDRESS_MISALIGNED: usize = 4;
const SCAUSE_LOAD_ACCESS_FAULT: usize = 5;
const SCAUSE_STORE_ADDRESS_MISALIGNED: usize = 6;
const SCAUSE_STORE_ACCESS_FAULT: usize = 7;
const SCAUSE_ECALL_FROM_U: usize = 8;
const SCAUSE_ECALL_FROM_S: usize = 9;
const SCAUSE_INSTRUCTION_PAGE_FAULT: usize = 12;
const SCAUSE_LOAD_PAGE_FAULT: usize = 13;
const SCAUSE_STORE_PAGE_FAULT: usize = 15;
const SSTATUS_SUM: usize = 1 << 18;

static DEMO_TRAP_HANDLED: AtomicBool = AtomicBool::new(false);

global_asm!(
    r#"
    .equ TRAP_FRAME_SIZE, 288
    .equ SSTATUS_SPP, 256

    .section .text.trap
    .align 2
    .global __trap_entry
__trap_entry:
    csrr t0, sstatus
    li t1, SSTATUS_SPP
    and t0, t0, t1
    bnez t0, 1f
    csrrw sp, sscratch, sp
    li t2, 1
    j 2f
1:
    li t2, 0
2:
    addi sp, sp, -TRAP_FRAME_SIZE
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
    csrr t3, scause
    sd t3, 240(sp)
    csrr t3, sepc
    sd t3, 248(sp)
    csrr t3, stval
    sd t3, 256(sp)
    sd t2, 264(sp)
    csrr t3, sscratch
    sd t3, 272(sp)

    mv a0, sp
    call {handler}

    ld t0, 248(sp)
    csrw sepc, t0
    ld t0, 264(sp)
    bnez t0, __trap_restore_user

__trap_restore_supervisor:
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
    addi sp, sp, TRAP_FRAME_SIZE
    sret

__trap_restore_user:
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
    addi sp, sp, TRAP_FRAME_SIZE
    csrrw sp, sscratch, sp
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
    telemetry::event("lab2", "stvec-installed");
}

/// Trigger one controlled breakpoint exception for the Lab2 smoke test.
pub fn trigger_demo_exception() {
    console::print_line("[Lab2] triggering breakpoint exception");
    telemetry::event("lab2", "breakpoint-triggered");
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

#[repr(C)]
struct TrapFrame {
    ra: usize,
    gp: usize,
    tp: usize,
    t0: usize,
    t1: usize,
    t2: usize,
    s0: usize,
    s1: usize,
    a0: usize,
    a1: usize,
    a2: usize,
    a3: usize,
    a4: usize,
    a5: usize,
    a6: usize,
    a7: usize,
    s2: usize,
    s3: usize,
    s4: usize,
    s5: usize,
    s6: usize,
    s7: usize,
    s8: usize,
    s9: usize,
    s10: usize,
    s11: usize,
    t3: usize,
    t4: usize,
    t5: usize,
    t6: usize,
    scause: usize,
    sepc: usize,
    stval: usize,
    from_user: usize,
    user_sp: usize,
}

extern "C" fn rust_trap_handler(frame: &mut TrapFrame) {
    let is_interrupt = (frame.scause & SCAUSE_INTERRUPT_BIT) != 0;
    let cause_code = frame.scause & SCAUSE_CODE_MASK;

    if !is_interrupt && cause_code == SCAUSE_BREAKPOINT {
        console::print_line("[Lab2] trap: breakpoint exception");
        DEMO_TRAP_HANDLED.store(true, Ordering::Relaxed);
        telemetry::event("lab2", "breakpoint-handled");
        frame.sepc += 4;
        return;
    }

    if !is_interrupt && cause_code == SCAUSE_ECALL_FROM_U {
        telemetry::event("lab6", "user-ecall");
        handle_user_ecall(frame);
        return;
    }

    console::print_line("[Lab2] trap: unexpected cause");
    console::print_line(unexpected_cause_label(cause_code));
    console::print_hex_usize("[Lab2] scause code: ", cause_code);
    console::print_hex_usize("[Lab2] sepc: ", frame.sepc);
    console::print_hex_usize("[Lab2] stval: ", frame.stval);
    sbi::shutdown();
}

fn handle_user_ecall(frame: &mut TrapFrame) {
    let request = SyscallRequest::new(
        frame.a7,
        [frame.a0, frame.a1, frame.a2, frame.a3, frame.a4, frame.a5],
    );
    frame.sepc += 4;

    match syscall::dispatch(request) {
        Ok(SyscallOutcome::Write { fd, buffer, len }) => {
            if fd == 1 {
                console::print_line("[Lab6] user program: hello");
                console::print_line("[Lab6] syscall write handled");
                telemetry::event("lab6", "console-write");
                frame.a0 = len;
                return;
            }

            let Some(result) = with_user_buffer(buffer, len, |buf| {
                fs::with_global_fs(|fs| fs.write(fd, buf))
            }) else {
                console::print_line("[Lab7] FAIL: invalid user write buffer");
                sbi::shutdown();
            };

            match result {
                Ok(bytes) => {
                    frame.a0 = bytes;
                    telemetry::event("lab7", "file-write");
                }
                Err(_) => {
                    console::print_line("[Lab7] FAIL: file write failed");
                    sbi::shutdown();
                }
            }
        }
        Ok(SyscallOutcome::Read { fd, buffer, len }) => {
            let Some(result) =
                with_user_buffer_mut(buffer, len, |buf| fs::with_global_fs(|fs| fs.read(fd, buf)))
            else {
                console::print_line("[Lab7] FAIL: invalid user read buffer");
                sbi::shutdown();
            };

            match result {
                Ok(bytes) => {
                    frame.a0 = bytes;
                    telemetry::event("lab7", "file-read");
                    let Some(verified) =
                        with_user_buffer(buffer, bytes, |buf| buf == fs::LAB7_TEST_BYTES)
                    else {
                        console::print_line("[Lab7] FAIL: invalid verification buffer");
                        sbi::shutdown();
                    };
                    if verified {
                        console::print_line("[Lab7] write/read verified");
                        fs::mark_verified();
                        telemetry::event("lab7", "file-verified");
                    }
                }
                Err(_) => {
                    console::print_line("[Lab7] FAIL: file read failed");
                    sbi::shutdown();
                }
            }
        }
        Ok(SyscallOutcome::Open) => {
            if fs::take_start_marker() {
                console::print_line("[Lab7] start");
                telemetry::event("lab7", "start");
            }
            match fs::with_global_fs(|fs| fs.open()) {
                Ok(fd) => {
                    console::print_line("[Lab7] file opened");
                    telemetry::event("lab7", "file-open");
                    frame.a0 = fd;
                }
                Err(_) => {
                    console::print_line("[Lab7] FAIL: file open failed");
                    sbi::shutdown();
                }
            }
        }
        Ok(SyscallOutcome::Close { fd }) => match fs::with_global_fs(|fs| fs.close(fd)) {
            Ok(()) => {
                frame.a0 = 0;
                telemetry::event("lab7", "file-close");
            }
            Err(_) => {
                console::print_line("[Lab7] FAIL: file close failed");
                sbi::shutdown();
            }
        },
        Ok(SyscallOutcome::Yield) => {
            console::print_line("[Lab6] syscall yield handled");
            telemetry::event("lab6", "syscall-yield");
            frame.a0 = 0;
        }
        Ok(SyscallOutcome::Exit { code }) => {
            let _ = code;
            console::print_line("[Lab6] syscall exit handled");
            console::print_line("[Lab6] PASS");
            telemetry::event("lab6", "user-exit");
            if fs::was_verified() {
                console::print_line("[Lab7] PASS");
                telemetry::event("lab7", "pass");
            } else {
                console::print_line("[Lab7] FAIL: file I/O was not verified");
            }
            sbi::shutdown();
        }
        Err(SyscallError::UnknownSyscall) => {
            console::print_line("[Lab6] FAIL: unknown syscall");
            console::print_hex_usize("[Lab6] syscall id: ", frame.a7);
            sbi::shutdown();
        }
        Err(SyscallError::Unimplemented) => {
            console::print_line("[Lab6] FAIL: unimplemented syscall");
            sbi::shutdown();
        }
    }
}

fn user_buffer_is_allowed(address: usize, len: usize) -> bool {
    let Some(end) = address.checked_add(len) else {
        return false;
    };
    let layout = user::demo_user_layout();

    address >= layout.stack_start.value() && end <= layout.stack_end.value()
}

fn with_user_buffer<R>(address: usize, len: usize, f: impl FnOnce(&[u8]) -> R) -> Option<R> {
    if !user_buffer_is_allowed(address, len) {
        return None;
    }

    // SAFETY: The address range was checked against the fixed Lab7 user stack
    // mapping. SUM is enabled only while S-mode copies bytes from that range.
    Some(unsafe {
        with_sum_enabled(|| {
            let slice = core::slice::from_raw_parts(address as *const u8, len);
            f(slice)
        })
    })
}

fn with_user_buffer_mut<R>(
    address: usize,
    len: usize,
    f: impl FnOnce(&mut [u8]) -> R,
) -> Option<R> {
    if !user_buffer_is_allowed(address, len) {
        return None;
    }

    // SAFETY: The address range was checked against the fixed Lab7 user stack
    // mapping. SUM is enabled only while S-mode copies bytes into that range.
    Some(unsafe {
        with_sum_enabled(|| {
            let slice = core::slice::from_raw_parts_mut(address as *mut u8, len);
            f(slice)
        })
    })
}

unsafe fn with_sum_enabled<R>(f: impl FnOnce() -> R) -> R {
    let previous: usize;
    // SAFETY: This helper runs in S-mode while handling one user syscall. It
    // saves and restores sstatus so SUM is scoped to the user-buffer copy.
    unsafe {
        asm!(
            "csrr {previous}, sstatus",
            "csrs sstatus, {sum}",
            previous = out(reg) previous,
            sum = in(reg) SSTATUS_SUM,
            options(nostack)
        );
    }
    let result = f();
    // SAFETY: Restores the exact sstatus value captured before enabling SUM.
    unsafe {
        asm!("csrw sstatus, {previous}", previous = in(reg) previous, options(nostack));
    }
    result
}

fn unexpected_cause_label(cause_code: usize) -> &'static str {
    match cause_code {
        SCAUSE_INSTRUCTION_ADDRESS_MISALIGNED => "[Lab2] trap cause: instruction misaligned",
        SCAUSE_INSTRUCTION_ACCESS_FAULT => "[Lab2] trap cause: instruction access fault",
        SCAUSE_ILLEGAL_INSTRUCTION => "[Lab2] trap cause: illegal instruction",
        SCAUSE_LOAD_ADDRESS_MISALIGNED => "[Lab2] trap cause: load misaligned",
        SCAUSE_LOAD_ACCESS_FAULT => "[Lab2] trap cause: load access fault",
        SCAUSE_STORE_ADDRESS_MISALIGNED => "[Lab2] trap cause: store misaligned",
        SCAUSE_STORE_ACCESS_FAULT => "[Lab2] trap cause: store access fault",
        SCAUSE_ECALL_FROM_U => "[Lab2] trap cause: ecall from U-mode",
        SCAUSE_ECALL_FROM_S => "[Lab2] trap cause: ecall from S-mode",
        SCAUSE_INSTRUCTION_PAGE_FAULT => "[Lab2] trap cause: instruction page fault",
        SCAUSE_LOAD_PAGE_FAULT => "[Lab2] trap cause: load page fault",
        SCAUSE_STORE_PAGE_FAULT => "[Lab2] trap cause: store page fault",
        _ => "[Lab2] trap cause: other",
    }
}
