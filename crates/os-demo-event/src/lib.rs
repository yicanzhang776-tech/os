#![no_std]
#![forbid(unsafe_code)]
//! Validation and allocation-free encoding for tagged OS teaching events.
//!
//! The teaching kernel emits a deliberately small serial format:
//!
//! ```text
//! [OS_DEMO] lab=<lab> step=<step>\n
//! ```
//!
//! The local JavaScript bridge converts this tagged line into the stable
//! [`EVENT_PROTOCOL`] object shape. This crate owns only the two fields that
//! are present on the kernel wire. Browser-side `status`, `detail`, and
//! `source` derivation remain unchanged.

use core::fmt;

/// Stable protocol name used by the browser-side normalized event object.
pub const EVENT_PROTOCOL: &str = "os-demo.event/v1";

/// Maximum number of ASCII bytes accepted in an event step.
///
/// This matches the existing JavaScript protocol rule
/// `[a-z0-9][a-z0-9-]{0,79}`.
pub const MAX_STEP_BYTES: usize = 80;

const EVENT_PREFIX: &str = "[OS_DEMO] lab=";
const STEP_SEPARATOR: &str = " step=";
const LINE_ENDING: &str = "\n";

/// Lab identifier accepted by the current kernel telemetry entry point.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Lab {
    /// Minimal QEMU/OpenSBI baseline.
    P0,
    /// Boot and SBI console.
    Lab1,
    /// Trap entry and return.
    Lab2,
    /// Physical frame allocation.
    Lab3,
    /// Sv39 page tables.
    Lab4,
    /// Cooperative task scheduling.
    Lab5,
    /// User mode and system calls.
    Lab6,
    /// Device abstraction and the teaching file system.
    Lab7,
    /// Existing kernel-wide panic source used by `telemetry::event`.
    Kernel,
}

impl Lab {
    /// Return the exact lowercase identifier written to the serial line.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::P0 => "p0",
            Self::Lab1 => "lab1",
            Self::Lab2 => "lab2",
            Self::Lab3 => "lab3",
            Self::Lab4 => "lab4",
            Self::Lab5 => "lab5",
            Self::Lab6 => "lab6",
            Self::Lab7 => "lab7",
            Self::Kernel => "kernel",
        }
    }
}

impl TryFrom<&str> for Lab {
    type Error = ValidationError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "p0" => Ok(Self::P0),
            "lab1" => Ok(Self::Lab1),
            "lab2" => Ok(Self::Lab2),
            "lab3" => Ok(Self::Lab3),
            "lab4" => Ok(Self::Lab4),
            "lab5" => Ok(Self::Lab5),
            "lab6" => Ok(Self::Lab6),
            "lab7" => Ok(Self::Lab7),
            "kernel" => Ok(Self::Kernel),
            _ => Err(ValidationError::InvalidLab),
        }
    }
}

/// Status inferred by the existing JavaScript tagged-event parser.
///
/// Tagged kernel lines do not serialize a status field. The parser treats the
/// `pass` step as passed, the `panic` step as failed, and every other tagged
/// step as running. TODO status continues to come from the existing console
/// marker parser rather than this tagged format.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EventStatus {
    /// The event describes an in-progress mechanism step.
    Running,
    /// The event is the final `pass` step.
    Pass,
    /// The event is the `panic` failure step.
    Fail,
}

impl EventStatus {
    /// Return the exact status name used by `os-demo.event/v1`.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Pass => "pass",
            Self::Fail => "fail",
        }
    }
}

/// Validation failure detected before any event bytes are written.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ValidationError {
    /// The Lab identifier is not one of the identifiers emitted by the kernel.
    InvalidLab,
    /// The step is empty.
    EmptyStep,
    /// The step exceeds [`MAX_STEP_BYTES`].
    StepTooLong,
    /// The step contains a byte outside the stable ASCII step grammar.
    InvalidStepCharacter,
}

/// Failure returned by [`write_event`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EncodeError {
    /// One of the borrowed event fields is invalid.
    Validation(ValidationError),
    /// The destination implementing [`fmt::Write`] rejected output.
    Write,
}

/// Borrowed, validated kernel event data.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Event<'a> {
    lab: Lab,
    step: &'a str,
}

impl<'a> Event<'a> {
    /// Validate and construct an event without allocating.
    pub fn new(lab: Lab, step: &'a str) -> Result<Self, ValidationError> {
        validate_step(step)?;
        Ok(Self { lab, step })
    }

    /// Validate the string-based fields accepted by the existing kernel API.
    pub fn from_parts(lab: &str, step: &'a str) -> Result<Self, ValidationError> {
        Self::new(Lab::try_from(lab)?, step)
    }

    /// Return the validated Lab identifier.
    pub const fn lab(self) -> Lab {
        self.lab
    }

    /// Return the validated step without copying it.
    pub const fn step(self) -> &'a str {
        self.step
    }

    /// Derive status using the current browser tagged-event rule.
    pub fn status(self) -> EventStatus {
        match self.step {
            "pass" => EventStatus::Pass,
            "panic" => EventStatus::Fail,
            _ => EventStatus::Running,
        }
    }

    /// Write the byte-compatible tagged serial line without heap allocation.
    pub fn write_to<W: fmt::Write>(self, writer: &mut W) -> fmt::Result {
        writer.write_str(EVENT_PREFIX)?;
        writer.write_str(self.lab.as_str())?;
        writer.write_str(STEP_SEPARATOR)?;
        writer.write_str(self.step)?;
        writer.write_str(LINE_ENDING)
    }
}

/// Validate and encode one event through a `core::fmt::Write` destination.
///
/// Validation is completed before the first write, so invalid or overlong
/// fields never produce a partial event line.
pub fn write_event<W: fmt::Write>(
    writer: &mut W,
    lab: &str,
    step: &str,
) -> Result<EventStatus, EncodeError> {
    let event = Event::from_parts(lab, step).map_err(EncodeError::Validation)?;
    let status = event.status();
    event.write_to(writer).map_err(|_| EncodeError::Write)?;
    Ok(status)
}

fn validate_step(step: &str) -> Result<(), ValidationError> {
    let bytes = step.as_bytes();
    if bytes.is_empty() {
        return Err(ValidationError::EmptyStep);
    }
    if bytes.len() > MAX_STEP_BYTES {
        return Err(ValidationError::StepTooLong);
    }
    if !is_lower_alphanumeric(bytes[0]) {
        return Err(ValidationError::InvalidStepCharacter);
    }
    if bytes[1..]
        .iter()
        .any(|byte| !is_lower_alphanumeric(*byte) && *byte != b'-')
    {
        return Err(ValidationError::InvalidStepCharacter);
    }
    Ok(())
}

const fn is_lower_alphanumeric(byte: u8) -> bool {
    byte.is_ascii_lowercase() || byte.is_ascii_digit()
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FixedBuffer<const N: usize> {
        bytes: [u8; N],
        length: usize,
    }

    impl<const N: usize> FixedBuffer<N> {
        const fn new() -> Self {
            Self {
                bytes: [0; N],
                length: 0,
            }
        }

        fn as_str(&self) -> &str {
            core::str::from_utf8(&self.bytes[..self.length]).expect("encoder writes UTF-8")
        }
    }

    impl<const N: usize> fmt::Write for FixedBuffer<N> {
        fn write_str(&mut self, value: &str) -> fmt::Result {
            let end = self.length.checked_add(value.len()).ok_or(fmt::Error)?;
            let destination = self.bytes.get_mut(self.length..end).ok_or(fmt::Error)?;
            destination.copy_from_slice(value.as_bytes());
            self.length = end;
            Ok(())
        }
    }

    fn encoded(lab: &str, step: &str) -> FixedBuffer<128> {
        let mut output = FixedBuffer::new();
        write_event(&mut output, lab, step).expect("sample event must encode");
        output
    }

    #[test]
    fn protocol_version_is_stable() {
        assert_eq!(EVENT_PROTOCOL, "os-demo.event/v1");
    }

    #[test]
    fn p0_and_lab_identifiers_encode_exactly() {
        let cases = [
            (Lab::P0, "p0", "[OS_DEMO] lab=p0 step=start\n"),
            (Lab::Lab1, "lab1", "[OS_DEMO] lab=lab1 step=start\n"),
            (Lab::Lab2, "lab2", "[OS_DEMO] lab=lab2 step=start\n"),
            (Lab::Lab3, "lab3", "[OS_DEMO] lab=lab3 step=start\n"),
            (Lab::Lab4, "lab4", "[OS_DEMO] lab=lab4 step=start\n"),
            (Lab::Lab5, "lab5", "[OS_DEMO] lab=lab5 step=start\n"),
            (Lab::Lab6, "lab6", "[OS_DEMO] lab=lab6 step=start\n"),
            (Lab::Lab7, "lab7", "[OS_DEMO] lab=lab7 step=start\n"),
        ];
        for (lab, name, expected) in cases {
            assert_eq!(lab.as_str(), name);
            assert_eq!(Lab::try_from(name), Ok(lab));
            assert_eq!(encoded(name, "start").as_str(), expected);
        }
    }

    #[test]
    fn known_statuses_match_the_existing_tagged_parser() {
        assert_eq!(
            Event::new(Lab::Lab1, "console-available").unwrap().status(),
            EventStatus::Running
        );
        assert_eq!(
            Event::new(Lab::Lab7, "pass").unwrap().status(),
            EventStatus::Pass
        );
        assert_eq!(
            Event::new(Lab::Kernel, "panic").unwrap().status(),
            EventStatus::Fail
        );
        assert_eq!(EventStatus::Running.as_str(), "running");
        assert_eq!(EventStatus::Pass.as_str(), "pass");
        assert_eq!(EventStatus::Fail.as_str(), "fail");
    }

    #[test]
    fn identical_input_produces_identical_output() {
        let first = encoded("lab4", "satp-activated");
        let second = encoded("lab4", "satp-activated");
        assert_eq!(first.as_str(), second.as_str());
    }

    #[test]
    fn invalid_or_overlong_fields_are_rejected_before_writing() {
        let mut output = FixedBuffer::<128>::new();
        assert_eq!(
            write_event(&mut output, "lab8", "start"),
            Err(EncodeError::Validation(ValidationError::InvalidLab))
        );
        assert_eq!(output.as_str(), "");
        assert_eq!(
            write_event(&mut output, "lab1", ""),
            Err(EncodeError::Validation(ValidationError::EmptyStep))
        );
        assert_eq!(
            write_event(
                &mut output,
                "lab1",
                core::str::from_utf8(&[b'a'; MAX_STEP_BYTES + 1]).unwrap()
            ),
            Err(EncodeError::Validation(ValidationError::StepTooLong))
        );
        assert_eq!(output.as_str(), "");
    }

    #[test]
    fn boundary_breaking_characters_are_rejected() {
        for step in [
            "two words",
            "line\nbreak",
            "status=pass",
            "Uppercase",
            "bracket]",
            "事件",
            "-leading",
        ] {
            assert_eq!(
                Event::new(Lab::Lab2, step),
                Err(ValidationError::InvalidStepCharacter),
                "{step}"
            );
        }
    }

    #[test]
    fn fixed_stack_buffer_is_sufficient_for_encoding() {
        let mut output = FixedBuffer::<128>::new();
        let status = write_event(&mut output, "lab5", "context-switched").unwrap();
        assert_eq!(status, EventStatus::Running);
        assert_eq!(
            output.as_str(),
            "[OS_DEMO] lab=lab5 step=context-switched\n"
        );
    }

    #[test]
    fn typical_lab_events_remain_byte_compatible() {
        let cases = [
            (
                "lab1",
                "console-available",
                "[OS_DEMO] lab=lab1 step=console-available\n",
            ),
            ("lab1", "sbi-ecall", "[OS_DEMO] lab=lab1 step=sbi-ecall\n"),
            (
                "lab2",
                "breakpoint-triggered",
                "[OS_DEMO] lab=lab2 step=breakpoint-triggered\n",
            ),
            (
                "lab2",
                "breakpoint-handled",
                "[OS_DEMO] lab=lab2 step=breakpoint-handled\n",
            ),
            (
                "lab4",
                "text-mapped",
                "[OS_DEMO] lab=lab4 step=text-mapped\n",
            ),
            (
                "lab4",
                "satp-activated",
                "[OS_DEMO] lab=lab4 step=satp-activated\n",
            ),
            (
                "lab5",
                "yield-called",
                "[OS_DEMO] lab=lab5 step=yield-called\n",
            ),
            (
                "lab5",
                "context-switched",
                "[OS_DEMO] lab=lab5 step=context-switched\n",
            ),
            ("lab7", "file-open", "[OS_DEMO] lab=lab7 step=file-open\n"),
            ("lab7", "file-read", "[OS_DEMO] lab=lab7 step=file-read\n"),
            ("lab7", "file-write", "[OS_DEMO] lab=lab7 step=file-write\n"),
            ("lab7", "file-close", "[OS_DEMO] lab=lab7 step=file-close\n"),
        ];
        for (lab, step, expected) in cases {
            assert_eq!(encoded(lab, step).as_str(), expected);
        }
    }

    #[test]
    fn a_small_destination_returns_an_error_without_panicking() {
        let mut output = FixedBuffer::<8>::new();
        assert_eq!(
            write_event(&mut output, "lab1", "start"),
            Err(EncodeError::Write)
        );
    }
}
