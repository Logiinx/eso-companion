use std::{fs, path::Path};

fn main() {
    // Tauri's Windows resource step expects an ICO even when the app bundle is disabled.
    // Generate a small neutral icon here so the portable build needs no checked-in binary asset.
    let icons_dir = Path::new("icons");
    fs::create_dir_all(icons_dir).expect("create icons directory");
    fs::write(icons_dir.join("icon.ico"), make_icon()).expect("write Windows icon");
    tauri_build::build()
}

fn make_icon() -> Vec<u8> {
    const WIDTH: usize = 32;
    const HEIGHT: usize = 32;
    const PIXEL_BYTES: usize = WIDTH * HEIGHT * 4;
    const MASK_ROW_BYTES: usize = ((WIDTH + 31) / 32) * 4;
    const MASK_BYTES: usize = MASK_ROW_BYTES * HEIGHT;
    const DIB_BYTES: usize = 40 + PIXEL_BYTES + MASK_BYTES;

    let mut dib = Vec::with_capacity(DIB_BYTES);
    push_u32(&mut dib, 40);
    push_u32(&mut dib, WIDTH as u32);
    push_u32(&mut dib, (HEIGHT * 2) as u32);
    push_u16(&mut dib, 1);
    push_u16(&mut dib, 32);
    push_u32(&mut dib, 0);
    push_u32(&mut dib, PIXEL_BYTES as u32);
    push_u32(&mut dib, 0);
    push_u32(&mut dib, 0);
    push_u32(&mut dib, 0);
    push_u32(&mut dib, 0);

    // Dark navy tile with a simple gold ESO-style diamond in BGRA, bottom row first.
    for y in (0..HEIGHT).rev() {
        for x in 0..WIDTH {
            let dx = (x as isize - 16).unsigned_abs();
            let dy = (y as isize - 16).unsigned_abs();
            let gold = dx + dy <= 11 && dx + dy >= 8;
            let (b, g, r) = if gold { (55, 180, 225) } else { (37, 27, 18) };
            dib.extend_from_slice(&[b, g, r, 255]);
        }
    }
    dib.resize(DIB_BYTES, 0);

    let mut ico = Vec::with_capacity(22 + dib.len());
    push_u16(&mut ico, 0);
    push_u16(&mut ico, 1);
    push_u16(&mut ico, 1);
    ico.extend_from_slice(&[WIDTH as u8, HEIGHT as u8, 0, 0]);
    push_u16(&mut ico, 1);
    push_u16(&mut ico, 32);
    push_u32(&mut ico, DIB_BYTES as u32);
    push_u32(&mut ico, 22);
    ico.extend_from_slice(&dib);
    ico
}

fn push_u16(bytes: &mut Vec<u8>, value: u16) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(bytes: &mut Vec<u8>, value: u32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}
