#![no_std]

pub mod memory;
pub mod syscall;
pub mod task;
pub mod user;

#[cfg(test)]
mod lab6_contract_tests {
    use super::{syscall, user};

    #[test]
    fn user_context_records_entry_stack_and_privilege_defaults() {
        let context = user::UserContext::new(0x8040_0000, 0x8050_0008);

        assert_eq!(context.entry(), 0x8040_0000);
        assert_eq!(context.stack_top(), 0x8050_0000);
        assert_eq!(context.sepc(), 0x8040_0000);
        assert!(context.uses_user_privilege());
    }

    #[test]
    fn syscall_numbers_match_lab6_teaching_abi() {
        assert_eq!(syscall::SYS_WRITE, 64);
        assert_eq!(syscall::SYS_YIELD, 124);
        assert_eq!(syscall::SYS_EXIT, 93);
    }

    #[test]
    fn syscall_dispatcher_is_explicitly_incomplete_in_starter() {
        let request = syscall::SyscallRequest::new(syscall::SYS_WRITE, [1, 0x1000, 4, 0, 0, 0]);

        assert_eq!(
            syscall::dispatch(request),
            Err(syscall::SyscallError::Unimplemented)
        );
    }

    #[test]
    fn lab6_starter_interfaces_are_present_without_claiming_success() {
        assert!(user::starter_interfaces_are_present());
        assert!(syscall::starter_interfaces_are_present());
    }
}
