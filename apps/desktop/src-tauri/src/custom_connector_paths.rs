//! Where a Bot-written connector package, its grant, its cursors and its in-flight batches live
//! (20261128-people-archive 03, 03b).
//!
//! One root, the app's Yonder directory, holds the packages the Bot wrote (`connectors/<slug>/`)
//! and the three small books the device keeps beside them. The root is spelled out here and in
//! [`crate::custom_connectors::base_dir`], which is the one place that knows the platform's shape;
//! this module only names the files inside it.

use std::path::PathBuf;

/// The standard package root: `<app data>/Yonder/connectors/`.
pub fn packages_root() -> Result<PathBuf, String> {
    crate::custom_connectors::packages_root()
}

/// The local authorization file: what the owner confirmed on this device.
pub fn grants_file() -> Result<PathBuf, String> {
    crate::custom_connectors::grants_file()
}

/// The acknowledged poll cursor per connection.
pub fn cursors_file() -> Result<PathBuf, String> {
    crate::custom_connectors::cursors_file()
}

/// Batch id → the cursor it would advance to; written by a collect, consumed by the ack.
pub fn batches_file() -> Result<PathBuf, String> {
    crate::custom_connectors::batches_file()
}

/// The package directory for one slug, under the standard root.
pub fn package_root(slug: &str) -> Result<PathBuf, String> {
    crate::custom_connectors::package_root(slug)
}
