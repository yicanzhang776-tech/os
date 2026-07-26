#![allow(dead_code)]

use core::sync::atomic::{AtomicBool, Ordering};

use crate::drivers::{self, ByteDevice, DeviceError, RamDevice};

/// First user-visible file descriptor used by the teaching file system.
pub const FIRST_FILE_DESCRIPTOR: usize = 3;
/// Maximum concurrently opened files in Lab7.
pub const MAX_OPEN_FILES: usize = 4;
/// Bytes available in the single teaching file.
pub const FILE_CAPACITY: usize = drivers::RAM_DEVICE_CAPACITY;
/// Marker printed by the Lab7 starter path.
pub const LAB7_TODO_MARKER: &str = "[Lab7] TODO: implement memory file system";
/// Bytes used by the built-in Lab7 user program.
pub const LAB7_TEST_BYTES: &[u8; 4] = b"LAB7";

static LAB7_STARTED: AtomicBool = AtomicBool::new(false);
static LAB7_VERIFIED: AtomicBool = AtomicBool::new(false);

/// Errors returned by the Lab7 starter file system.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FsError {
    /// The starter exposes the boundary but leaves file operations to students.
    Unimplemented,
    /// The file descriptor does not refer to an open file.
    InvalidFileDescriptor,
    /// No descriptor slot is available.
    TooManyOpenFiles,
    /// The backing device cannot store more data.
    NoSpace,
}

#[derive(Clone, Copy)]
struct OpenFile {
    offset: usize,
}

/// Small in-memory file system planned for Lab7.
pub struct SimpleFs {
    device: RamDevice,
    file_len: usize,
    open_files: [Option<OpenFile>; MAX_OPEN_FILES],
}

impl SimpleFs {
    /// Create an empty teaching file system.
    pub const fn new() -> Self {
        Self {
            device: RamDevice::new(),
            file_len: 0,
            open_files: [None; MAX_OPEN_FILES],
        }
    }

    /// Return the capacity of the single teaching file.
    pub const fn capacity(&self) -> usize {
        self.device.capacity()
    }

    /// Open the single teaching file.
    pub fn open(&mut self) -> Result<usize, FsError> {
        for index in 0..MAX_OPEN_FILES {
            if self.open_files[index].is_none() {
                self.open_files[index] = Some(OpenFile { offset: 0 });
                return Ok(FIRST_FILE_DESCRIPTOR + index);
            }
        }

        Err(FsError::TooManyOpenFiles)
    }

    /// Read from an open file descriptor.
    pub fn read(&mut self, fd: usize, buf: &mut [u8]) -> Result<usize, FsError> {
        let index = self.fd_index(fd)?;
        let mut file = self.open_files[index].ok_or(FsError::InvalidFileDescriptor)?;
        let available = self.file_len.saturating_sub(file.offset);
        let amount = core::cmp::min(available, buf.len());

        self.device
            .read_at(file.offset, &mut buf[..amount])
            .map_err(map_device_error)?;
        file.offset += amount;
        self.open_files[index] = Some(file);
        Ok(amount)
    }

    /// Write to an open file descriptor.
    pub fn write(&mut self, fd: usize, buf: &[u8]) -> Result<usize, FsError> {
        let index = self.fd_index(fd)?;
        let mut file = self.open_files[index].ok_or(FsError::InvalidFileDescriptor)?;
        let end = file.offset.checked_add(buf.len()).ok_or(FsError::NoSpace)?;
        if end > self.capacity() {
            return Err(FsError::NoSpace);
        }

        self.device
            .write_at(file.offset, buf)
            .map_err(map_device_error)?;
        file.offset = end;
        self.file_len = core::cmp::max(self.file_len, end);
        self.open_files[index] = Some(file);
        Ok(buf.len())
    }

    /// Close an open file descriptor.
    pub fn close(&mut self, fd: usize) -> Result<(), FsError> {
        let index = self.fd_index(fd)?;
        if self.open_files[index].is_none() {
            return Err(FsError::InvalidFileDescriptor);
        }

        self.open_files[index] = None;
        Ok(())
    }

    fn fd_index(&self, fd: usize) -> Result<usize, FsError> {
        let index = fd
            .checked_sub(FIRST_FILE_DESCRIPTOR)
            .ok_or(FsError::InvalidFileDescriptor)?;
        if index >= MAX_OPEN_FILES {
            return Err(FsError::InvalidFileDescriptor);
        }

        Ok(index)
    }
}

impl Default for SimpleFs {
    fn default() -> Self {
        Self::new()
    }
}

/// Return whether the Lab7 file-system starter interfaces are wired.
pub fn starter_interfaces_are_present() -> bool {
    let mut fs = SimpleFs::new();
    let fd = match fs.open() {
        Ok(fd) => fd,
        Err(_) => return false,
    };
    let mut one_byte = [0u8; 1];

    drivers::starter_interfaces_are_present()
        && fs.capacity() == FILE_CAPACITY
        && fs.write(fd, &[1]) == Ok(1)
        && fs.close(fd) == Ok(())
        && fs.open() == Ok(FIRST_FILE_DESCRIPTOR)
        && fs.read(FIRST_FILE_DESCRIPTOR, &mut one_byte) == Ok(1)
        && one_byte[0] == 1
}

/// Return whether task 2 has a working simplified file-system implementation.
pub fn simple_fs_stage_is_complete() -> bool {
    let mut fs = SimpleFs::new();
    let fd = match fs.open() {
        Ok(fd) => fd,
        Err(_) => return false,
    };
    let mut buf = [0u8; 2];

    fs.write(fd, b"hi").is_ok()
        && fs.close(fd).is_ok()
        && fs.close(fd) == Err(FsError::InvalidFileDescriptor)
        && fs.open() == Ok(fd)
        && fs.read(fd, &mut buf).is_ok()
        && buf == *b"hi"
        && fs.read(fd + MAX_OPEN_FILES + 1, &mut buf) == Err(FsError::InvalidFileDescriptor)
}

fn map_device_error(error: DeviceError) -> FsError {
    match error {
        DeviceError::OutOfBounds => FsError::NoSpace,
        DeviceError::Unimplemented => FsError::Unimplemented,
    }
}

static mut LAB7_FS: SimpleFs = SimpleFs::new();

/// Mutably borrow the single teaching file system.
pub fn with_global_fs<R>(f: impl FnOnce(&mut SimpleFs) -> R) -> R {
    // SAFETY: The teaching kernel runs Lab7 on one hart and handles one user
    // program at a time. No nested borrow is created while a syscall is active.
    let fs = unsafe { &mut *core::ptr::addr_of_mut!(LAB7_FS) };
    f(fs)
}

/// Return true only for the first Lab7 syscall that should print the start log.
pub fn take_start_marker() -> bool {
    !LAB7_STARTED.swap(true, Ordering::SeqCst)
}

/// Record that the Lab7 user-space file I/O scenario has completed.
pub fn mark_verified() {
    LAB7_VERIFIED.store(true, Ordering::SeqCst);
}

/// Return whether the Lab7 QEMU scenario has completed.
pub fn was_verified() -> bool {
    LAB7_VERIFIED.load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::{
        starter_interfaces_are_present, FsError, SimpleFs, FILE_CAPACITY, FIRST_FILE_DESCRIPTOR,
    };

    #[test]
    fn simple_fs_open_write_read_and_close_round_trip() {
        let mut fs = SimpleFs::new();
        let fd = fs.open().expect("open teaching file");

        assert_eq!(fd, FIRST_FILE_DESCRIPTOR);
        assert_eq!(fs.write(fd, b"os"), Ok(2));
        assert_eq!(fs.close(fd), Ok(()));

        let fd = fs.open().expect("reopen teaching file");
        let mut buf = [0u8; 2];

        assert_eq!(fs.read(fd, &mut buf), Ok(2));
        assert_eq!(&buf, b"os");
        assert_eq!(fs.close(fd), Ok(()));
        assert!(starter_interfaces_are_present());
    }

    #[test]
    fn simple_fs_rejects_invalid_and_duplicate_close() {
        let mut fs = SimpleFs::new();
        let fd = fs.open().expect("open teaching file");

        assert_eq!(fs.close(fd), Ok(()));
        assert_eq!(fs.close(fd), Err(FsError::InvalidFileDescriptor));
        assert_eq!(
            fs.read(fd, &mut [0u8; 1]),
            Err(FsError::InvalidFileDescriptor)
        );
    }

    #[test]
    fn simple_fs_reports_capacity_and_open_table_limits() {
        let mut fs = SimpleFs::new();
        assert_eq!(fs.capacity(), FILE_CAPACITY);
        let first = fs.open().expect("first open");

        assert_eq!(
            fs.write(first, &[7u8; FILE_CAPACITY + 1]),
            Err(FsError::NoSpace)
        );

        for _ in 1..super::MAX_OPEN_FILES {
            assert!(fs.open().is_ok());
        }
        assert_eq!(fs.open(), Err(FsError::TooManyOpenFiles));
    }
}
