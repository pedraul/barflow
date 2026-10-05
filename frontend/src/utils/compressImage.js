export default function compressImage(file) {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('Please select a valid image file.'))
  }

  const objectUrl = URL.createObjectURL(file)

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        const maxDimension = 1200
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('Could not process the selected image.')
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      } catch (error) {
        reject(error)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read the image. Choose a JPG, PNG, or WebP image.'))
    }
    image.src = objectUrl
  })
}
