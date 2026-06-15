package handler

import (
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/service"
)

func DesktopAIImagesGenerations(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		Fail(w, "请求格式不正确")
		return
	}
	input, err := readDesktopGenerationInput(r)
	if err != nil {
		FailError(w, err)
		return
	}
	result, err := service.GenerateDesktopCloudImage(strings.TrimSpace(r.Header.Get("Authorization")), input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, []map[string]any{{
		"b64_json":     result.Base64Data,
		"url":          result.URL,
		"mime_type":    result.MIMEType,
		"width":        result.Width,
		"height":       result.Height,
		"bytes":        result.Bytes,
		"ossObjectKey": result.ObjectKey,
	}})
}

func readDesktopGenerationInput(r *http.Request) (service.DesktopGenerationInput, error) {
	input := service.DesktopGenerationInput{
		TicketID:    strings.TrimSpace(r.FormValue("ticket_id")),
		TicketToken: strings.TrimSpace(r.FormValue("ticket_token")),
		DeviceID:    strings.TrimSpace(r.FormValue("device_id")),
	}
	if input.TicketID == "" || input.TicketToken == "" || input.DeviceID == "" {
		return service.DesktopGenerationInput{}, desktopGenerationRequestError{message: "缺少桌面云端生成票据参数"}
	}
	form := r.MultipartForm
	for _, fileHeader := range append(form.File["reference_images"], form.File["image"]...) {
		image, err := readDesktopReferenceImage(fileHeader)
		if err != nil {
			return service.DesktopGenerationInput{}, err
		}
		input.References = append(input.References, image)
	}
	if masks := form.File["mask"]; len(masks) > 0 {
		mask, err := readDesktopReferenceImage(masks[0])
		if err != nil {
			return service.DesktopGenerationInput{}, err
		}
		input.Mask = &mask
	}
	return input, nil
}

func readDesktopReferenceImage(fileHeader *multipart.FileHeader) (service.DesktopReferenceImage, error) {
	file, err := fileHeader.Open()
	if err != nil {
		return service.DesktopReferenceImage{}, err
	}
	defer file.Close()
	content, err := io.ReadAll(io.LimitReader(file, 16<<20))
	if err != nil {
		return service.DesktopReferenceImage{}, err
	}
	return service.DesktopReferenceImage{
		Filename:    fileHeader.Filename,
		ContentType: fileHeader.Header.Get("Content-Type"),
		Bytes:       content,
	}, nil
}

type desktopGenerationRequestError struct {
	message string
}

func (err desktopGenerationRequestError) Error() string {
	return err.message
}

func (err desktopGenerationRequestError) SafeMessage() string {
	return err.message
}
