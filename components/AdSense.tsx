import Script from 'next/script';
import React from 'react'

const AdSense = () => {
  return (
    <Script
        async
        src={"https://www.googletagmanager.com/gtag/js?id=AW-733635438"}
        crossOrigin='anonymous'
        strategy='afterInteractive'
    />
  )
}

export default AdSense