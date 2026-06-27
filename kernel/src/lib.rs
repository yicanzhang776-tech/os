#![no_std]

pub mod drivers;
pub mod fs;
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
    fn syscall_dispatcher_handles_lab6_teaching_abi() {
        let request = syscall::SyscallRequest::new(syscall::SYS_WRITE, [1, 0x1000, 4, 0, 0, 0]);

        assert_eq!(
            syscall::dispatch(request),
            Ok(syscall::SyscallOutcome::Write { bytes: 4 })
        );
        assert_eq!(
            syscall::dispatch(syscall::SyscallRequest::new(syscall::SYS_YIELD, [0; 6])),
            Ok(syscall::SyscallOutcome::Yield)
        );
        assert_eq!(
            syscall::dispatch(syscall::SyscallRequest::new(
                syscall::SYS_EXIT,
                [7, 0, 0, 0, 0, 0]
            )),
            Ok(syscall::SyscallOutcome::Exit { code: 7 })
        );
    }

    #[test]
    fn lab6_starter_interfaces_are_present_without_claiming_success() {
        assert!(user::starter_interfaces_are_present());
        assert!(syscall::starter_interfaces_are_present());
    }

    #[test]
    fn user_layout_provides_non_overlapping_code_and_stack_ranges() {
        let layout = user::demo_user_layout();

        assert!(layout.text_start.value() < layout.text_end.value());
        assert!(layout.stack_start.value() < layout.stack_end.value());
        assert!(layout.text_end.value() <= layout.stack_start.value());
    }
}

#[cfg(test)]
mod lab7_starter_contract_tests {
    use super::{drivers, fs};

    #[test]
    fn lab7_starter_interfaces_are_present_without_claiming_success() {
        assert!(drivers::starter_interfaces_are_present());
        assert!(fs::starter_interfaces_are_present());
    }
}
