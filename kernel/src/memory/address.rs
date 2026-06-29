/// Size of one physical page in bytes.
pub const PAGE_SIZE: usize = 4096;

/// A physical address used by the Lab3 frame allocator.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct PhysAddr(pub usize);

impl PhysAddr {
    /// Create a physical address from a raw integer.
    pub const fn new(value: usize) -> Self {
        Self(value)
    }

    /// Return the raw integer value of this address.
    pub const fn value(self) -> usize {
        self.0
    }

    /// Return the page number containing this address.
    pub fn floor(self) -> PhysPageNum {
        // TODO(LAB3-T1): divide by PAGE_SIZE after reasoning about page layout.
        let _ = self;
        PhysPageNum::new(0)
    }

    /// Return the first page number whose page starts at or after this address.
    pub fn ceil(self) -> PhysPageNum {
        // TODO(LAB3-T1): handle aligned and unaligned addresses separately.
        let _ = self;
        PhysPageNum::new(0)
    }

    /// Return this address's offset inside its 4 KiB page.
    pub fn page_offset(self) -> usize {
        // TODO(LAB3-T1): keep only the low bits within one page.
        let _ = self;
        0
    }
}

/// A physical page number used by the Lab3 frame allocator.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct PhysPageNum(pub usize);

impl PhysPageNum {
    /// Create a physical page number from a raw integer.
    pub const fn new(value: usize) -> Self {
        Self(value)
    }

    /// Return the raw integer value of this page number.
    pub const fn value(self) -> usize {
        self.0
    }

    /// Return the start address of this physical page.
    pub fn start_address(self) -> PhysAddr {
        // TODO(LAB3-T1): multiply the page number by PAGE_SIZE.
        let _ = self;
        PhysAddr::new(0)
    }
}

impl From<PhysPageNum> for PhysAddr {
    fn from(value: PhysPageNum) -> Self {
        value.start_address()
    }
}
