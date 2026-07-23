#![allow(dead_code)]

#[cfg(target_arch = "riscv64")]
use core::arch::{asm, global_asm};

use crate::memory::PhysAddr;

const STACK_ALIGN: usize = 16;
const SSTATUS_SPIE: usize = 1 << 5;
const SSTATUS_SPP: usize = 1 << 8;

/// Size of the first fixed teaching user stack.
pub const USER_STACK_SIZE: usize = 4096 * 2;
/// Planned entry address used by the Lab6 starter checks.
pub const DEMO_USER_ENTRY: usize = 0x8040_0000;
/// Planned user stack top used by the Lab6 starter checks.
pub const DEMO_USER_STACK_TOP: usize = 0x8050_0000;
const KERNEL_TRAP_STACK_SIZE: usize = 4096;

#[cfg(target_arch = "riscv64")]
global_asm!(
    r#"
    .section .user.text, "ax"
    .align 2
    .global __lab6_user_entry
__lab6_user_entry:
    li a0, 1
    li a1, 0
    li a2, 4
    li a7, 64
    ecall

    addi sp, sp, -16
    li t0, 0x3742414c
    sw t0, 0(sp)

    li a7, 1024
    ecall
    mv s0, a0

    mv a0, s0
    mv a1, sp
    li a2, 4
    li a7, 64
    ecall

    mv a0, s0
    li a7, 57
    ecall

    li a7, 1024
    ecall
    mv s0, a0

    sw zero, 0(sp)
    mv a0, s0
    mv a1, sp
    li a2, 4
    li a7, 63
    ecall

    lw t1, 0(sp)
    li t0, 0x3742414c
    bne t0, t1, 2f

    mv a0, s0
    li a7, 57
    ecall

    li a0, 0
    li a7, 93
    ecall
2:
    li a0, 1
    li a7, 93
    ecall
1:
    j 1b

    .section .text.user_enter
    .align 2
    .global __lab6_enter_user
__lab6_enter_user:
    mv sp, a0
    sret
    "#
);

#[cfg(target_arch = "riscv64")]
unsafe extern "C" {
    fn __lab6_enter_user(user_stack_top: usize) -> !;
    fn __lab6_user_entry();
    fn suser_text();
    fn euser_text();
    fn suser_stack();
    fn euser_stack();
}

#[repr(align(16))]
struct KernelTrapStack {
    bytes: [u8; KERNEL_TRAP_STACK_SIZE],
}

static mut LAB6_KERNEL_TRAP_STACK: KernelTrapStack = KernelTrapStack {
    bytes: [0; KERNEL_TRAP_STACK_SIZE],
};

/// Minimal user-mode context planned for Lab6.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct UserContext {
    entry: usize,
    stack_top: usize,
    sepc: usize,
    sstatus: usize,
}

impl UserContext {
    /// Build a planned user context without entering U-mode.
    pub fn new(entry: usize, stack_top: usize) -> Self {
        let aligned_stack_top = stack_top & !(STACK_ALIGN - 1);
        Self {
            entry,
            stack_top: aligned_stack_top,
            sepc: entry,
            sstatus: SSTATUS_SPIE,
        }
    }

    /// Return the planned user entry address.
    pub const fn entry(&self) -> usize {
        self.entry
    }

    /// Return the 16-byte aligned user stack top.
    pub const fn stack_top(&self) -> usize {
        self.stack_top
    }

    /// Return the planned `sepc` value used before `sret`.
    pub const fn sepc(&self) -> usize {
        self.sepc
    }

    /// Return whether the planned context is configured for U-mode return.
    pub const fn uses_user_privilege(&self) -> bool {
        (self.sstatus & SSTATUS_SPP) == 0
    }

    /// Return whether interrupts would be enabled after the planned `sret`.
    pub const fn enables_interrupts_after_sret(&self) -> bool {
        (self.sstatus & SSTATUS_SPIE) != 0
    }
}

/// Physical ranges reserved for the built-in Lab6 user program.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct UserMemoryLayout {
    /// Start of the user text range.
    pub text_start: PhysAddr,
    /// End of the user text range.
    pub text_end: PhysAddr,
    /// Start of the user stack range.
    pub stack_start: PhysAddr,
    /// End of the user stack range.
    pub stack_end: PhysAddr,
}

/// Static description of a future user program.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct UserProgram {
    entry: usize,
    stack_top: usize,
}

impl UserProgram {
    /// Create a minimal user program descriptor.
    pub const fn new(entry: usize, stack_top: usize) -> Self {
        Self { entry, stack_top }
    }

    /// Build the planned user context for this descriptor.
    pub fn context(self) -> UserContext {
        UserContext::new(self.entry, self.stack_top)
    }
}

/// Return the built-in Lab6 user program memory layout.
pub fn demo_user_layout() -> UserMemoryLayout {
    #[cfg(target_arch = "riscv64")]
    {
        UserMemoryLayout {
            text_start: PhysAddr::new(suser_text as *const () as usize),
            text_end: PhysAddr::new(euser_text as *const () as usize),
            stack_start: PhysAddr::new(suser_stack as *const () as usize),
            stack_end: PhysAddr::new(euser_stack as *const () as usize),
        }
    }

    #[cfg(not(target_arch = "riscv64"))]
    {
        UserMemoryLayout {
            text_start: PhysAddr::new(DEMO_USER_ENTRY),
            text_end: PhysAddr::new(DEMO_USER_ENTRY + 4096),
            stack_start: PhysAddr::new(DEMO_USER_STACK_TOP - USER_STACK_SIZE),
            stack_end: PhysAddr::new(DEMO_USER_STACK_TOP),
        }
    }
}

/// Return the built-in user program descriptor.
pub fn demo_user_program() -> UserProgram {
    #[cfg(target_arch = "riscv64")]
    {
        let layout = demo_user_layout();
        UserProgram::new(
            __lab6_user_entry as *const () as usize,
            layout.stack_end.value(),
        )
    }

    #[cfg(not(target_arch = "riscv64"))]
    {
        UserProgram::new(DEMO_USER_ENTRY, DEMO_USER_STACK_TOP)
    }
}

/// Enter the built-in user program.
pub fn enter_demo_user() -> ! {
    let context = demo_user_program().context();
    prepare_user_context(&context);

    #[cfg(target_arch = "riscv64")]
    {
        // SAFETY: `prepare_user_context` set `sepc`, `sstatus` and `sscratch`.
        // The user stack and text are mapped with user permissions before this
        // function is called from Lab6.
        unsafe {
            __lab6_enter_user(context.stack_top());
        }
    }

    #[cfg(not(target_arch = "riscv64"))]
    {
        loop {
            core::hint::spin_loop();
        }
    }
}

fn prepare_user_context(context: &UserContext) {
    #[cfg(target_arch = "riscv64")]
    {
        let trap_stack_top = kernel_trap_stack_top();
        let mut sstatus: usize;
        // SAFETY: Lab6 enters one fixed user program on one hart. `sscratch`
        // is reserved for the user-trap stack switch while the user program is
        // running.
        unsafe {
            asm!("csrr {value}, sstatus", value = out(reg) sstatus, options(nostack));
            sstatus &= !SSTATUS_SPP;
            sstatus |= SSTATUS_SPIE;
            asm!(
                "csrw sepc, {entry}",
                "csrw sstatus, {sstatus_value}",
                "csrw sscratch, {trap_stack}",
                entry = in(reg) context.sepc(),
                sstatus_value = in(reg) sstatus,
                trap_stack = in(reg) trap_stack_top,
                options(nostack)
            );
        }
    }

    #[cfg(not(target_arch = "riscv64"))]
    {
        let _ = context;
    }
}

#[cfg(target_arch = "riscv64")]
fn kernel_trap_stack_top() -> usize {
    let base = core::ptr::addr_of!(LAB6_KERNEL_TRAP_STACK).cast::<u8>() as usize;
    (base + KERNEL_TRAP_STACK_SIZE) & !(STACK_ALIGN - 1)
}

/// Return whether the Lab6 user-mode starter interfaces are wired.
pub fn starter_interfaces_are_present() -> bool {
    let program = demo_user_program();
    let context = program.context();
    let layout = demo_user_layout();

    context.entry() == context.sepc()
        && context.stack_top().is_multiple_of(STACK_ALIGN)
        && context.uses_user_privilege()
        && context.enables_interrupts_after_sret()
        && layout.text_start.value() < layout.text_end.value()
        && layout.stack_start.value() < layout.stack_end.value()
        && layout.text_end.value() <= layout.stack_start.value()
        && USER_STACK_SIZE == 8192
}

#[cfg(test)]
mod tests {
    use super::{UserContext, DEMO_USER_ENTRY, DEMO_USER_STACK_TOP};

    #[test]
    fn user_context_aligns_stack_and_records_sepc() {
        let context = UserContext::new(DEMO_USER_ENTRY, DEMO_USER_STACK_TOP + 15);

        assert_eq!(context.entry(), DEMO_USER_ENTRY);
        assert_eq!(context.sepc(), DEMO_USER_ENTRY);
        assert_eq!(context.stack_top(), DEMO_USER_STACK_TOP);
    }

    #[test]
    fn user_context_is_planned_for_user_privilege() {
        let context = UserContext::new(DEMO_USER_ENTRY, DEMO_USER_STACK_TOP);

        assert!(context.uses_user_privilege());
        assert!(context.enables_interrupts_after_sret());
    }
}
