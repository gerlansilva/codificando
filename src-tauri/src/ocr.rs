//! OCR nativo do macOS via Apple Vision (VNRecognizeTextRequest).
//!
//! Recebe os bytes de uma imagem (PNG/JPEG) e devolve o texto reconhecido,
//! uma linha por observação, na ordem de leitura (de cima para baixo).

#[cfg(target_os = "macos")]
mod imp {
    use objc2::rc::{autoreleasepool, Retained};
    use objc2::runtime::AnyObject;
    use objc2::AnyThread;
    use objc2_foundation::{NSArray, NSData, NSDictionary, NSString};
    use objc2_vision::{
        VNImageOption, VNImageRequestHandler, VNRecognizeTextRequest, VNRecognizedTextObservation,
        VNRequest, VNRequestTextRecognitionLevel,
    };

    /// Idiomas preferidos, quando o sistema os suporta no nível "accurate".
    const PREFERRED_LANGUAGES: [&str; 2] = ["pt-BR", "en-US"];

    fn supported_languages(request: &VNRecognizeTextRequest) -> Vec<String> {
        // SAFETY: apenas consulta; o request acabou de ser criado.
        match unsafe { request.supportedRecognitionLanguagesAndReturnError() } {
            Ok(list) => list.iter().map(|s| s.to_string()).collect(),
            Err(_) => Vec::new(),
        }
    }

    /// Reconhece texto em uma imagem codificada (PNG, JPEG, TIFF…).
    pub fn recognize_image(bytes: &[u8]) -> Result<String, String> {
        if bytes.is_empty() {
            return Err("imagem vazia".to_string());
        }
        autoreleasepool(|_| {
            let data = NSData::with_bytes(bytes);
            let request = VNRecognizeTextRequest::new();
            request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
            request.setUsesLanguageCorrection(true);

            let supported = supported_languages(&request);
            let wanted: Vec<Retained<NSString>> = PREFERRED_LANGUAGES
                .iter()
                .filter(|code| {
                    supported
                        .iter()
                        .any(|s| s.eq_ignore_ascii_case(code))
                })
                .map(|code| NSString::from_str(code))
                .collect();
            if !wanted.is_empty() {
                request.setRecognitionLanguages(&NSArray::from_retained_slice(&wanted));
            }

            let options: Retained<NSDictionary<VNImageOption, AnyObject>> =
                NSDictionary::from_slices(&[] as &[&VNImageOption], &[] as &[&AnyObject]);
            let handler = VNImageRequestHandler::initWithData_options(
                VNImageRequestHandler::alloc(),
                &data,
                &options,
            );

            // SAFETY: o request é um VNRequest válido e mantido vivo até o fim.
            let requests: Retained<NSArray<VNRequest>> =
                NSArray::from_retained_slice(&[unsafe {
                    Retained::cast_unchecked::<VNRequest>(request.clone())
                }]);
            handler
                .performRequests_error(&requests)
                .map_err(|e| format!("falha no Vision: {}", e.localizedDescription()))?;

            // SAFETY: o request já foi processado; results contém
            // VNRecognizedTextObservation.
            let results = request.results().unwrap_or_default();
            let mut lines: Vec<(f64, f64, String)> = Vec::new();
            for obs in results.iter() {
                let obs: &VNRecognizedTextObservation =
                    unsafe { &*(Retained::as_ptr(&obs) as *const VNRecognizedTextObservation) };
                let candidates = obs.topCandidates(1);
                let Some(best) = candidates.iter().next() else {
                    continue;
                };
                let text = best.string().to_string();
                if text.trim().is_empty() {
                    continue;
                }
                let bbox = unsafe { obs.boundingBox() };
                lines.push((bbox.origin.y, bbox.origin.x, text));
            }

            // Vision usa origem no canto inferior esquerdo: y maior = mais alto.
            lines.sort_by(|a, b| {
                b.0.partial_cmp(&a.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then(a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            });

            Ok(lines
                .into_iter()
                .map(|(_, _, text)| text)
                .collect::<Vec<_>>()
                .join("\n"))
        })
    }
}

#[cfg(target_os = "macos")]
pub use imp::recognize_image;

#[cfg(not(target_os = "macos"))]
pub fn recognize_image(_bytes: &[u8]) -> Result<String, String> {
    Err("OCR disponível apenas no macOS".to_string())
}

/// Compatibilidade com o nome usado pelo frontend (imagens PNG).
#[allow(dead_code)]
pub fn recognize_png(bytes: &[u8]) -> Result<String, String> {
    recognize_image(bytes)
}

/// Comando Tauri: recebe a imagem em base64 e devolve o texto reconhecido.
#[tauri::command]
pub async fn ocr_image(base64: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64.as_bytes())
        .map_err(|e| format!("base64 inválido: {}", e))?;
    tauri::async_runtime::spawn_blocking(move || recognize_image(&bytes))
        .await
        .map_err(|e| format!("OCR interrompido: {}", e))?
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    #[test]
    fn reconhece_texto_de_png() {
        let bytes = include_bytes!("../tests/fixtures/ocr-sample.png");
        let text = super::recognize_png(bytes).expect("OCR falhou");
        let lower = text.to_lowercase();
        assert!(
            lower.contains("codificando"),
            "texto reconhecido inesperado: {text:?}"
        );
        assert!(
            lower.contains("texto de teste"),
            "texto reconhecido inesperado: {text:?}"
        );
    }

    #[test]
    fn rejeita_imagem_vazia() {
        assert!(super::recognize_png(&[]).is_err());
    }
}
