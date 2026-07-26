#![allow(dead_code)]

/// Write bytes to a console-like output in the future Lab6 solution.
pub const SYS_WRITE: usize = 64;
/// Cooperatively yield the CPU in the future Lab6 solution.
pub const SYS_YIELD: usize = 124;
/// Exit the current user program in the future Lab6 solution.
pub const SYS_EXIT: usize = 93;

/// A decoded system call request following the Lab6 teaching ABI.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SyscallRequest {
    id: usize,
    args: [usize; 6],
}

impl SyscallRequest {
    /// Create a syscall request from the syscall id and up to six arguments.
    pub const fn new(id: usize, args: [usize; 6]) -> Self {
        Self { id, args }
    }

    /// Return the syscall id, normally passed in `a7`.
    pub const fn id(self) -> usize {
        self.id
    }

    /// Return syscall arguments, normally passed in `a0..a5`.
    pub const fn args(self) -> [usize; 6] {
        self.args
    }
}

/// Errors returned by the Lab6 starter syscall dispatcher.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SyscallError {
    /// The starter has not implemented syscall dispatch yet.
    Unimplemented,
    /// The syscall id is not part of the Lab6 teaching ABI.
    UnknownSyscall,
}

/// Successful result of a Lab6 teaching system call.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SyscallOutcome {
    /// The write syscall accepted `bytes` bytes for the teaching console.
    Write { bytes: usize },
    /// The yield syscall requested a cooperative reschedule point.
    Yield,
    /// The exit syscall ended the user program with `code`.
    Exit { code: usize },
}

/// Dispatch one system call request.
pub fn dispatch(request: SyscallRequest) -> Result<SyscallOutcome, SyscallError> {
    match request.id() {
        SYS_WRITE => Ok(SyscallOutcome::Write {
            bytes: request.args()[2],
        }),
        SYS_YIELD => Ok(SyscallOutcome::Yield),
        SYS_EXIT => Ok(SyscallOutcome::Exit {
            code: request.args()[0],
        }),
        _ => Err(SyscallError::UnknownSyscall),
    }
}

/// Return whether the Lab6 syscall starter interfaces are wired.
pub fn starter_interfaces_are_present() -> bool {
    let write = SyscallRequest::new(SYS_WRITE, [1, 0x1000, 4, 0, 0, 0]);
    let yield_now = SyscallRequest::new(SYS_YIELD, [0; 6]);
    let exit = SyscallRequest::new(SYS_EXIT, [0, 0, 0, 0, 0, 0]);
    let unknown = SyscallRequest::new(usize::MAX, [0; 6]);

    write.args()[0] == 1
        && dispatch(write) == Ok(SyscallOutcome::Write { bytes: 4 })
        && dispatch(yield_now) == Ok(SyscallOutcome::Yield)
        && dispatch(exit) == Ok(SyscallOutcome::Exit { code: 0 })
        && dispatch(unknown) == Err(SyscallError::UnknownSyscall)
}

/// Return whether Lab6 task 2 syscall ABI work is complete.
pub fn syscall_abi_stage_is_complete() -> bool {
    let write = SyscallRequest::new(SYS_WRITE, [1, 0x1000, 4, 0, 0, 0]);
    let yield_now = SyscallRequest::new(SYS_YIELD, [0; 6]);
    let exit = SyscallRequest::new(SYS_EXIT, [0, 0, 0, 0, 0, 0]);
    let unknown = SyscallRequest::new(usize::MAX, [0; 6]);

    dispatch(write) == Ok(SyscallOutcome::Write { bytes: 4 })
        && dispatch(yield_now) == Ok(SyscallOutcome::Yield)
        && dispatch(exit) == Ok(SyscallOutcome::Exit { code: 0 })
        && dispatch(unknown) == Err(SyscallError::UnknownSyscall)
}

#[cfg(test)]
mod tests {
    use super::{
        dispatch, SyscallError, SyscallOutcome, SyscallRequest, SYS_EXIT, SYS_WRITE, SYS_YIELD,
    };

    #[test]
    fn request_records_id_and_arguments() {
        let request = SyscallRequest::new(SYS_WRITE, [1, 2, 3, 4, 5, 6]);

        assert_eq!(request.id(), SYS_WRITE);
        assert_eq!(request.args(), [1, 2, 3, 4, 5, 6]);
    }

    #[test]
    fn dispatcher_handles_planned_syscalls() {
        assert_eq!(
            dispatch(SyscallRequest::new(SYS_WRITE, [1, 0x1000, 5, 0, 0, 0])),
            Ok(SyscallOutcome::Write { bytes: 5 })
        );
        assert_eq!(
            dispatch(SyscallRequest::new(SYS_YIELD, [0; 6])),
            Ok(SyscallOutcome::Yield)
        );
        assert_eq!(
            dispatch(SyscallRequest::new(SYS_EXIT, [9, 0, 0, 0, 0, 0])),
            Ok(SyscallOutcome::Exit { code: 9 })
        );
    }

    #[test]
    fn starter_dispatch_rejects_unknown_syscalls() {
        assert_eq!(
            dispatch(SyscallRequest::new(0xdead, [0; 6])),
            Err(SyscallError::UnknownSyscall)
        );
    }
}
