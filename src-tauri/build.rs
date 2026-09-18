use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};
use std::path::Path;

fn main() {
    generate_windows_icon().expect("falha ao gerar o ícone da L.I.V.I.A.");
    tauri_build::build()
}

fn generate_windows_icon() -> Result<(), image::ImageError> {
    let mut canvas = RgbaImage::from_pixel(256, 256, Rgba([7, 13, 17, 255]));

    rounded_rect(&mut canvas, 10, 10, 246, 246, 44, Rgba([46, 77, 89, 255]));
    rounded_rect(&mut canvas, 18, 18, 238, 238, 37, Rgba([7, 13, 17, 255]));
    rounded_rect(&mut canvas, 62, 55, 99, 183, 18, Rgba([216, 241, 246, 255]));
    rounded_rect(&mut canvas, 62, 151, 184, 191, 20, Rgba([90, 196, 219, 255]));
    rounded_rect(&mut canvas, 132, 60, 188, 100, 14, Rgba([61, 151, 174, 255]));
    rounded_rect(&mut canvas, 132, 112, 159, 139, 10, Rgba([46, 96, 112, 255]));
    rounded_rect(&mut canvas, 166, 112, 193, 139, 10, Rgba([39, 73, 84, 255]));
    rounded_rect(&mut canvas, 202, 60, 210, 139, 4, Rgba([34, 64, 75, 255]));

    DynamicImage::ImageRgba8(canvas)
        .save_with_format(Path::new("icons/icon.ico"), ImageFormat::Ico)
}

fn rounded_rect(
    image: &mut RgbaImage,
    left: u32,
    top: u32,
    right: u32,
    bottom: u32,
    radius: u32,
    color: Rgba<u8>,
) {
    let r = radius as i64;
    let corners = [
        (left as i64 + r, top as i64 + r),
        (right as i64 - r - 1, top as i64 + r),
        (left as i64 + r, bottom as i64 - r - 1),
        (right as i64 - r - 1, bottom as i64 - r - 1),
    ];

    for y in top..bottom {
        for x in left..right {
            let xi = x as i64;
            let yi = y as i64;
            let in_middle = x >= left + radius
                && x < right.saturating_sub(radius)
                || y >= top + radius
                    && y < bottom.saturating_sub(radius);

            let in_corner = corners.iter().any(|(cx, cy)| {
                let dx = xi - cx;
                let dy = yi - cy;
                dx * dx + dy * dy <= r * r
            });

            if in_middle || in_corner {
                image.put_pixel(x, y, color);
            }
        }
    }
}
