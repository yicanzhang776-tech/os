#![allow(dead_code)]

/// Write bytes to a console-like output in the future Lab6 solution.
pub const SYS_WRITE: usize = 64;
/// Cooperatively yield the CPU in the future Lab6 solution.
pub const SYS_YIELD: usize = 124;
/// Exit the current user program in the future Lab6 solution.
pub const SYS_EXIT: usize = 93;
/// Read bytes from a Lab7 file descriptor.
pub const SYS_READ: usize = 63;
/// Close a Lab7 file descriptor.
pub const SYS_CLOSE: usize = 57;
/// Open the single Lab7 teaching file.
pub const SYS_OPEN: usize = 1024;

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
    /// The write syscall requested output to a console or file descriptor.
    Write {
        fd: usize,
        buffer: usize,
        len: usize,
    },
    /// The yield syscall requested a cooperative reschedule point.
    Yield,
    /// The exit syscall ended the user program with `code`.
    Exit { code: usize },
    /// The read syscall requested file input.
    Read {
        fd: usize,
        buffer: usize,
        len: usize,
    },
    /// The open syscall requested the single teaching file.
    Open,
    /// The close syscall requested descriptor cleanup.
    Close { fd: usize },
}

/// Dispatch one system call request.
pub fn dispatch(request: SyscallRequest) -> Result<SyscallOutcome, SyscallError> {
    match request.id() {
        SYS_WRITE => Ok(SyscallOutcome::Write {
            fd: request.args()[0],
            buffer: request.args()[1],
            len: request.args()[2],
        }),
        SYS_YIELD => Ok(SyscallOutcome::Yield),
        SYS_EXIT => Ok(SyscallOutcome::Exit {
            code: request.args()[0],
        }),
        SYS_READ => Ok(SyscallOutcome::Read {
            fd: request.args()[0],
            buffer: request.args()[1],
            len: request.args()[2],
        }),
        SYS_OPEN => Ok(SyscallOutcome::Open),
        SYS_CLOSE => Ok(SyscallOutcome::Close {
            fd: request.args()[0],
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
        && dispatch(write)
            == Ok(SyscallOutcome::Write {
                fd: 1,
                buffer: 0x1000,
                len: 4,
            })
        && dispatch(yield_now) == Ok(SyscallOutcome::Yield)
        && dispatch(exit) == Ok(SyscallOutcome::Exit { code: 0 })
        && dispatch(unknown) == Err(SyscallError::UnknownSyscall)
}

#[cfg(test)]
mod tests {
    use super::{
        dispatch, SyscallError, SyscallOutcome, SyscallRequest, SYS_CLOSE, SYS_EXIT, SYS_OPEN,
        SYS_READ, SYS_WRITE, SYS_YIELD,
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
            Ok(SyscallOutcome::Write {
                fd: 1,
                buffer: 0x1000,
                len: 5,
            })
        );
        assert_eq!(
            dispatch(SyscallRequest::new(SYS_YIELD, [0; 6])),
            Ok(SyscallOutcome::Yield)
        );
        assert_eq!(
            dispatch(SyscallRequest::new(SYS_EXIT, [9, 0, 0, 0, 0, 0])),
            Ok(SyscallOutcome::Exit { code: 9 })
        );
        assert_eq!(
            dispatch(SyscallRequest::new(SYS_OPEN, [0; 6])),
            Ok(SyscallOutcome::Open)
        );
        assert_eq!(
            dispatch(SyscallRequest::new(SYS_READ, [3, 0x8050_0000, 4, 0, 0, 0])),
            Ok(SyscallOutcome::Read {
                fd: 3,
                buffer: 0x8050_0000,
                len: 4,
            })
        );
        assert_eq!(
            dispatch(SyscallRequest::new(SYS_CLOSE, [3, 0, 0, 0, 0, 0])),
            Ok(SyscallOutcome::Close { fd: 3 })
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
