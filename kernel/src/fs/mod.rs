#![allow(dead_code)]

use crate::drivers::{self, RamDevice};

/// First user-visible file descriptor used by the teaching file system.
pub const FIRST_FILE_DESCRIPTOR: usize = 3;
/// Maximum concurrently opened files in Lab7.
pub const MAX_OPEN_FILES: usize = 4;
/// Bytes available in the single teaching file.
pub const FILE_CAPACITY: usize = drivers::RAM_DEVICE_CAPACITY;
/// Marker printed by the Lab7 starter path.
pub const LAB7_TODO_MARKER: &str = "[Lab7] TODO: implement memory file system";

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

/// Small in-memory file system planned for Lab7.
pub struct SimpleFs {
    device: RamDevice,
}

impl SimpleFs {
    /// Create an empty teaching file system.
    pub const fn new() -> Self {
        Self {
            device: RamDevice::new(),
        }
    }

    /// Return the capacity of the single teaching file.
    pub const fn capacity(&self) -> usize {
        self.device.capacity()
    }

    /// Open the single teaching file.
    pub fn open(&mut self) -> Result<usize, FsError> {
        Err(FsError::Unimplemented)
    }

    /// Read from an open file descriptor.
    pub fn read(&mut self, _fd: usize, _buf: &mut [u8]) -> Result<usize, FsError> {
        Err(FsError::Unimplemented)
    }

    /// Write to an open file descriptor.
    pub fn write(&mut self, _fd: usize, _buf: &[u8]) -> Result<usize, FsError> {
        Err(FsError::Unimplemented)
    }

    /// Close an open file descriptor.
    pub fn close(&mut self, _fd: usize) -> Result<(), FsError> {
        Err(FsError::Unimplemented)
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
    let mut one_byte = [0u8; 1];

    drivers::starter_interfaces_are_present()
        && fs.capacity() == FILE_CAPACITY
        && fs.open() == Err(FsError::Unimplemented)
        && fs.write(FIRST_FILE_DESCRIPTOR, &[1]) == Err(FsError::Unimplemented)
        && fs.read(FIRST_FILE_DESCRIPTOR, &mut one_byte) == Err(FsError::Unimplemented)
        && fs.close(FIRST_FILE_DESCRIPTOR) == Err(FsError::Unimplemented)
}

#[cfg(test)]
mod tests {
    use super::{
        starter_interfaces_are_present, FsError, SimpleFs, FILE_CAPACITY, FIRST_FILE_DESCRIPTOR,
    };

    #[test]
    fn starter_fs_exposes_operations_without_implementing_them() {
        let mut fs = SimpleFs::new();
        let mut buf = [0u8; 1];

        assert_eq!(fs.capacity(), FILE_CAPACITY);
        assert_eq!(fs.open(), Err(FsError::Unimplemented));
        assert_eq!(
            fs.write(FIRST_FILE_DESCRIPTOR, &[1]),
            Err(FsError::Unimplemented)
        );
        assert_eq!(
            fs.read(FIRST_FILE_DESCRIPTOR, &mut buf),
            Err(FsError::Unimplemented)
        );
        assert_eq!(fs.close(FIRST_FILE_DESCRIPTOR), Err(FsError::Unimplemented));
        assert!(starter_interfaces_are_present());
    }
}
