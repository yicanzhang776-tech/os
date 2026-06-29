#![allow(dead_code)]

const STACK_ALIGN: usize = 16;
const SSTATUS_SPIE: usize = 1 << 5;
const SSTATUS_SPP: usize = 1 << 8;

/// Size of the first fixed teaching user stack.
pub const USER_STACK_SIZE: usize = 4096 * 2;
/// Planned entry address used by the Lab6 starter checks.
pub const DEMO_USER_ENTRY: usize = 0x8040_0000;
/// Planned user stack top used by the Lab6 starter checks.
pub const DEMO_USER_STACK_TOP: usize = 0x8050_0000;

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
            // TODO(LAB6-T1): set `sepc` to the user entry before `sret`.
            sepc: 0,
            // TODO(LAB6-T1): clear SPP and set SPIE for returning to U-mode.
            sstatus: 0,
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

/// Return whether the Lab6 user-mode starter interfaces are wired.
pub fn starter_interfaces_are_present() -> bool {
    let program = UserProgram::new(DEMO_USER_ENTRY, DEMO_USER_STACK_TOP + 8);
    let context = program.context();

    context.entry() == DEMO_USER_ENTRY
        && context.stack_top() == DEMO_USER_STACK_TOP
        && USER_STACK_SIZE == 8192
}

/// Return whether Lab6 task 1 user context work is complete.
pub fn user_context_stage_is_complete() -> bool {
    let program = UserProgram::new(DEMO_USER_ENTRY, DEMO_USER_STACK_TOP + 8);
    let context = program.context();

    context.entry() == DEMO_USER_ENTRY
        && context.sepc() == DEMO_USER_ENTRY
        && context.stack_top() == DEMO_USER_STACK_TOP
        && context.uses_user_privilege()
        && context.enables_interrupts_after_sret()
}

#[cfg(test)]
mod tests {
    use super::{UserContext, DEMO_USER_ENTRY, DEMO_USER_STACK_TOP};

    #[test]
    fn user_context_aligns_stack_and_records_sepc() {
        let context = UserContext::new(DEMO_USER_ENTRY, DEMO_USER_STACK_TOP + 15);

        assert_eq!(context.entry(), DEMO_USER_ENTRY);
        assert_eq!(context.stack_top(), DEMO_USER_STACK_TOP);
        assert_ne!(context.sepc(), DEMO_USER_ENTRY);
    }

    #[test]
    fn starter_user_context_leaves_privilege_bits_for_students() {
        let context = UserContext::new(DEMO_USER_ENTRY, DEMO_USER_STACK_TOP);

        assert!(context.uses_user_privilege());
        assert!(!context.enables_interrupts_after_sret());
    }
}
