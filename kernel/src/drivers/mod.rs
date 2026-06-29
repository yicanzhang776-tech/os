#![allow(dead_code)]

/// Bytes reserved for the first teaching RAM-backed device.
pub const RAM_DEVICE_CAPACITY: usize = 64;

/// Errors returned by the Lab7 starter device layer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeviceError {
    /// The starter exposes the boundary but leaves I/O logic to students.
    Unimplemented,
    /// The requested byte range is outside the device.
    OutOfBounds,
}

/// Minimal byte-addressable device interface used by Lab7.
pub trait ByteDevice {
    /// Read bytes starting at `offset` into `buf`.
    fn read_at(&self, offset: usize, buf: &mut [u8]) -> Result<usize, DeviceError>;

    /// Write bytes starting at `offset` from `buf`.
    fn write_at(&mut self, offset: usize, buf: &[u8]) -> Result<usize, DeviceError>;
}

/// Fixed-size RAM device for the teaching file system.
pub struct RamDevice {
    bytes: [u8; RAM_DEVICE_CAPACITY],
}

impl RamDevice {
    /// Create an empty RAM device.
    pub const fn new() -> Self {
        Self {
            bytes: [0; RAM_DEVICE_CAPACITY],
        }
    }

    /// Return the device capacity in bytes.
    pub const fn capacity(&self) -> usize {
        self.bytes.len()
    }
}

impl Default for RamDevice {
    fn default() -> Self {
        Self::new()
    }
}

impl ByteDevice for RamDevice {
    fn read_at(&self, offset: usize, buf: &mut [u8]) -> Result<usize, DeviceError> {
        let end = offset
            .checked_add(buf.len())
            .ok_or(DeviceError::OutOfBounds)?;
        if end > self.bytes.len() {
            return Err(DeviceError::OutOfBounds);
        }

        buf.copy_from_slice(&self.bytes[offset..end]);
        Ok(buf.len())
    }

    fn write_at(&mut self, offset: usize, buf: &[u8]) -> Result<usize, DeviceError> {
        let end = offset
            .checked_add(buf.len())
            .ok_or(DeviceError::OutOfBounds)?;
        if end > self.bytes.len() {
            return Err(DeviceError::OutOfBounds);
        }

        self.bytes[offset..end].copy_from_slice(buf);
        Ok(buf.len())
    }
}

/// Return whether the Lab7 device starter interfaces are wired.
pub fn starter_interfaces_are_present() -> bool {
    let mut device = RamDevice::new();
    let mut one_byte = [0u8; 1];

    device.capacity() == RAM_DEVICE_CAPACITY
        && device.write_at(0, &[1]) == Ok(1)
        && device.read_at(0, &mut one_byte) == Ok(1)
        && one_byte[0] == 1
}

/// Return whether task 1 has a working RAM byte device implementation.
pub fn ram_device_stage_is_complete() -> bool {
    let mut device = RamDevice::new();
    let mut buf = [0u8; 3];

    device.write_at(2, b"os!").is_ok()
        && device.read_at(2, &mut buf).is_ok()
        && buf == *b"os!"
        && device.write_at(RAM_DEVICE_CAPACITY - 1, b"too long") == Err(DeviceError::OutOfBounds)
}

#[cfg(test)]
mod tests {
    use super::{starter_interfaces_are_present, ByteDevice, DeviceError, RamDevice};

    #[test]
    fn ram_device_reads_and_writes_at_offsets() {
        let mut device = RamDevice::new();
        let mut buf = [0u8; 3];

        assert_eq!(device.write_at(2, b"os!"), Ok(3));
        assert_eq!(device.read_at(2, &mut buf), Ok(3));
        assert_eq!(&buf, b"os!");
    }

    #[test]
    fn ram_device_rejects_out_of_bounds_ranges() {
        let mut device = RamDevice::new();
        let mut buf = [0u8; 1];

        assert_eq!(device.capacity(), 64);
        assert_eq!(device.read_at(64, &mut buf), Err(DeviceError::OutOfBounds));
        assert_eq!(device.write_at(63, &[1, 2]), Err(DeviceError::OutOfBounds));
        assert!(starter_interfaces_are_present());
    }
}
