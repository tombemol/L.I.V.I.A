use ico::{IconDir, IconDirEntry, IconImage, ResourceType};
use image::{imageops::FilterType, Rgba, RgbaImage};
use std::{fs::File, io::BufWriter, path::Path};

fn main() {
    generate_app_icons().expect("falha ao gerar os ícones da L.I.V.I.A.");
    tauri_build::build()
}

fn generate_app_icons() -> Result<(), Box<dyn std::error::Error>> {
    let base = draw_mark(512);
    base.save("icons/icon.png")?;

    let mut icon = IconDir::new(ResourceType::Icon);

    for size in [16_u32, 20, 24, 32, 40, 48, 64, 128, 256] {
        let resized = image::imageops::resize(&base, size, size, FilterType::Lanczos3);
        let rgba = resized.into_raw();
        let image = IconImage::from_rgba_data(size, size, rgba);
        icon.add_entry(IconDirEntry::encode(&image)?);
    }

    let path = Path::new("icons/icon.ico");
    let file = BufWriter::new(File::create(path)?);
    icon.write(file)?;
    Ok(())
}

fn draw_mark(size: u32) -> RgbaImage {
    let s = size as f32 / 512.0;
    let mut image = RgbaImage::from_pixel(size, size, Rgba([0, 0, 0, 0]));

    rounded_rect(&mut image, 0, 0, size, size, (112.0 * s) as u32, Rgba([18, 21, 31, 255]));
    rounded_rect(&mut image, (27.0*s) as u32, (27.0*s) as u32, (485.0*s) as u32, (485.0*s) as u32, (89.0*s) as u32, Rgba([29, 33, 48, 255]));
    rounded_border(&mut image, (27.0*s) as u32, (27.0*s) as u32, (485.0*s) as u32, (485.0*s) as u32, (89.0*s) as u32, (8.0*s).max(1.0) as u32, Rgba([107, 118, 205, 255]));

    rounded_rect(&mut image, (127.0*s) as u32, (109.0*s) as u32, (187.0*s) as u32, (361.0*s) as u32, (30.0*s) as u32, Rgba([245, 247, 255, 255]));
    rounded_rect(&mut image, (127.0*s) as u32, (328.0*s) as u32, (369.0*s) as u32, (388.0*s) as u32, (30.0*s) as u32, Rgba([137, 151, 255, 255]));
    rounded_rect(&mut image, (276.0*s) as u32, (139.0*s) as u32, (395.0*s) as u32, (217.0*s) as u32, (27.0*s) as u32, Rgba([112, 128, 242, 255]));
    rounded_rect(&mut image, (276.0*s) as u32, (244.0*s) as u32, (331.0*s) as u32, (299.0*s) as u32, (18.0*s) as u32, Rgba([78, 91, 153, 255]));
    rounded_rect(&mut image, (340.0*s) as u32, (244.0*s) as u32, (395.0*s) as u32, (299.0*s) as u32, (18.0*s) as u32, Rgba([65, 74, 116, 255]));
    image
}

fn rounded_border(image: &mut RgbaImage, left:u32, top:u32, right:u32, bottom:u32, radius:u32, width:u32, color:Rgba<u8>) {
    let outer = image.clone();
    rounded_rect(image, left, top, right, bottom, radius, color);
    rounded_rect(image, left+width, top+width, right-width, bottom-width, radius.saturating_sub(width), Rgba([29,33,48,255]));
    drop(outer);
}

fn rounded_rect(image: &mut RgbaImage, left:u32, top:u32, right:u32, bottom:u32, radius:u32, color:Rgba<u8>) {
    let r = radius as i64;
    for y in top..bottom {
        for x in left..right {
            let xi=x as i64; let yi=y as i64;
            let cx = if x < left+radius { left as i64+r } else if x >= right.saturating_sub(radius) { right as i64-r-1 } else { xi };
            let cy = if y < top+radius { top as i64+r } else if y >= bottom.saturating_sub(radius) { bottom as i64-r-1 } else { yi };
            let dx=xi-cx; let dy=yi-cy;
            if dx*dx+dy*dy <= r*r || (x>=left+radius && x<right.saturating_sub(radius)) || (y>=top+radius && y<bottom.saturating_sub(radius)) {
                image.put_pixel(x,y,color);
            }
        }
    }
}
