import { describe, it, expect } from 'vitest'
import {
  buildSsdpSearchMessage, parseSsdpResponse,
  resolveUrl, parseDeviceDescription, findService, AV_TRANSPORT_RE, RENDERING_CONTROL_RE,
  mimeForFilename, upnpClassForMime, buildDidlLite,
  buildSoapEnvelope, soapActionHeader,
  buildSetAvTransportUriEnvelope, buildPlayEnvelope, buildPauseEnvelope, buildStopEnvelope,
  buildGetTransportInfoEnvelope, buildSetVolumeEnvelope, buildGetVolumeEnvelope,
  parseSoapFault, parseTransportInfoResponse, parseVolumeResponse,
  isSafeServedName,
} from '../../electron/castCore.cjs'

describe('castCore — SSDP', () => {
  it('builds a well-formed M-SEARCH addressed to the multicast group', () => {
    const msg = buildSsdpSearchMessage()
    expect(msg).toContain('M-SEARCH * HTTP/1.1')
    expect(msg).toContain('HOST: 239.255.255.250:1900')
    expect(msg).toContain('MAN: "ssdp:discover"')
    expect(msg).toContain('ST: urn:schemas-upnp-org:device:MediaRenderer:1')
    // Terminated with a blank line, or a real device's parser waits forever.
    expect(msg.endsWith('\r\n\r\n')).toBe(true)
  })

  it('honours a custom search target and MX', () => {
    const msg = buildSsdpSearchMessage({ mx: 5, st: 'ssdp:all' })
    expect(msg).toContain('MX: 5')
    expect(msg).toContain('ST: ssdp:all')
  })

  it('parses a real-shaped 200 OK reply, headers case-insensitively', () => {
    const raw = [
      'HTTP/1.1 200 OK',
      'CACHE-CONTROL: max-age=1800',
      'location: http://192.168.1.50:8080/description.xml',
      'usn: uuid:abc-123::urn:schemas-upnp-org:device:MediaRenderer:1',
      'ST: urn:schemas-upnp-org:device:MediaRenderer:1',
      'SERVER: Linux/1.0 UPnP/1.0 SomeTV/2.0',
      '', '',
    ].join('\r\n')
    const parsed = parseSsdpResponse(raw)
    expect(parsed).toEqual({
      location: 'http://192.168.1.50:8080/description.xml',
      usn: 'uuid:abc-123::urn:schemas-upnp-org:device:MediaRenderer:1',
      st: 'urn:schemas-upnp-org:device:MediaRenderer:1',
      server: 'Linux/1.0 UPnP/1.0 SomeTV/2.0',
    })
  })

  it('accepts a Buffer, not just a string, since a real UDP payload arrives as one', () => {
    const raw = 'HTTP/1.1 200 OK\r\nlocation: http://x/d.xml\r\n\r\n'
    expect(parseSsdpResponse(Buffer.from(raw, 'utf8'))?.location).toBe('http://x/d.xml')
  })

  it('rejects a non-200 status line', () => {
    expect(parseSsdpResponse('HTTP/1.1 404 Not Found\r\nlocation: http://x\r\n\r\n')).toBeNull()
  })

  it('rejects a reply with no LOCATION — nothing to fetch a description from', () => {
    expect(parseSsdpResponse('HTTP/1.1 200 OK\r\nST: foo\r\n\r\n')).toBeNull()
  })

  it('is total: garbage input never throws', () => {
    expect(parseSsdpResponse('')).toBeNull()
    expect(parseSsdpResponse(null)).toBeNull()
    expect(parseSsdpResponse(undefined)).toBeNull()
    expect(parseSsdpResponse('not even http')).toBeNull()
  })
})

describe('castCore — device description', () => {
  const DESC_XML = `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
    <friendlyName>Living Room TV</friendlyName>
    <modelName>SomeTV 2000</modelName>
    <UDN>uuid:abc-123</UDN>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:AVTransport</serviceId>
        <controlURL>/AVTransport/control</controlURL>
        <eventSubURL>/AVTransport/event</eventSubURL>
      </service>
      <service>
        <serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType>
        <controlURL>/RenderingControl/control</controlURL>
        <eventSubURL>/RenderingControl/event</eventSubURL>
      </service>
    </serviceList>
  </device>
</root>`
  const BASE = 'http://192.168.1.50:8080/description.xml'

  it('extracts identity and resolves relative control URLs against the description URL', () => {
    const desc = parseDeviceDescription(DESC_XML, BASE)
    expect(desc.friendlyName).toBe('Living Room TV')
    expect(desc.modelName).toBe('SomeTV 2000')
    expect(desc.udn).toBe('uuid:abc-123')
    expect(desc.services).toHaveLength(2)
    expect(desc.services[0].controlURL).toBe('http://192.168.1.50:8080/AVTransport/control')
    expect(desc.services[1].controlURL).toBe('http://192.168.1.50:8080/RenderingControl/control')
  })

  it('leaves an already-absolute control URL alone', () => {
    const xml = DESC_XML.replace('/AVTransport/control', 'http://elsewhere/control')
    const desc = parseDeviceDescription(xml, BASE)
    expect(desc.services[0].controlURL).toBe('http://elsewhere/control')
  })

  it('finds AVTransport and RenderingControl case-insensitively by service type', () => {
    const desc = parseDeviceDescription(DESC_XML, BASE)
    expect(findService(desc.services, AV_TRANSPORT_RE)?.serviceType).toMatch(/AVTransport/)
    expect(findService(desc.services, RENDERING_CONTROL_RE)?.serviceType).toMatch(/RenderingControl/)
  })

  it('returns null for a device with no matching service, rather than a half-populated object', () => {
    const desc = { services: [{ serviceType: 'urn:schemas-upnp-org:service:ContentDirectory:1', controlURL: 'x' }] }
    expect(findService(desc.services, AV_TRANSPORT_RE)).toBeNull()
  })

  it('falls back to "Unnamed device" rather than an empty string', () => {
    const desc = parseDeviceDescription('<root><device><UDN>u</UDN></device></root>', BASE)
    expect(desc.friendlyName).toBe('Unnamed device')
  })

  it('returns null for anything that is not a device description', () => {
    expect(parseDeviceDescription('<html>not upnp</html>', BASE)).toBeNull()
    expect(parseDeviceDescription('', BASE)).toBeNull()
    expect(parseDeviceDescription(null, BASE)).toBeNull()
  })
})

describe('castCore — MIME / DIDL-Lite metadata', () => {
  it('maps known extensions to their MIME type', () => {
    expect(mimeForFilename('clip.mp4')).toBe('video/mp4')
    expect(mimeForFilename('photo.PNG')).toBe('image/png')
    expect(mimeForFilename('song.mp3')).toBe('audio/mpeg')
  })

  it('defaults an unknown extension to a generic octet stream rather than guessing', () => {
    expect(mimeForFilename('mystery.xyz')).toBe('application/octet-stream')
    expect(mimeForFilename('')).toBe('application/octet-stream')
  })

  it('classes video/image/audio MIME types into the right DIDL-Lite upnp:class', () => {
    expect(upnpClassForMime('video/mp4')).toBe('object.item.videoItem')
    expect(upnpClassForMime('image/png')).toBe('object.item.imageItem')
    expect(upnpClassForMime('audio/mpeg')).toBe('object.item.audioItem')
    expect(upnpClassForMime('application/octet-stream')).toBe('object.item')
  })

  it('builds valid, escaped DIDL-Lite for a title with XML-special characters', () => {
    const xml = buildDidlLite({ title: 'Tom & Jerry <Ep 1>', mime: 'video/mp4', url: 'http://x/a.mp4' })
    expect(xml).toContain('<DIDL-Lite')
    expect(xml).toContain('object.item.videoItem')
    expect(xml).toContain('Tom &amp; Jerry &lt;Ep 1&gt;')
    expect(xml).not.toContain('Tom & Jerry <Ep')
    expect(xml).toContain('http://x/a.mp4')
  })

  it('falls back to a default title when none is given', () => {
    expect(buildDidlLite({ mime: 'image/png', url: 'http://x/a.png' })).toContain('Yogatik media')
  })
})

describe('castCore — SOAP envelopes', () => {
  it('wraps an action in a standard SOAP 1.1 envelope addressed to the given service type', () => {
    const env = buildSoapEnvelope('urn:schemas-upnp-org:service:AVTransport:1', 'Play', '<InstanceID>0</InstanceID>')
    expect(env).toContain('<s:Envelope')
    expect(env).toContain('<u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">')
    expect(env).toContain('<InstanceID>0</InstanceID>')
    expect(env).toContain('</u:Play>')
  })

  it('formats the SOAPACTION header exactly as "serviceType#action", quoted', () => {
    expect(soapActionHeader('urn:x:AVTransport:1', 'Play')).toBe('"urn:x:AVTransport:1#Play"')
  })

  it('SetAVTransportURI carries the URI and escaped metadata', () => {
    const env = buildSetAvTransportUriEnvelope('urn:x:AVTransport:1', {
      uri: 'http://x/a.mp4?a=1&b=2', metadataXml: '<DIDL-Lite/>',
    })
    expect(env).toContain('<CurrentURI>http://x/a.mp4?a=1&amp;b=2</CurrentURI>')
    expect(env).toContain('<CurrentURIMetaData>&lt;DIDL-Lite/&gt;</CurrentURIMetaData>')
  })

  it('Play/Pause/Stop/GetTransportInfo all carry InstanceID and the right action', () => {
    expect(buildPlayEnvelope('urn:x:AVTransport:1')).toContain('<u:Play')
    expect(buildPlayEnvelope('urn:x:AVTransport:1')).toContain('<Speed>1</Speed>')
    expect(buildPauseEnvelope('urn:x:AVTransport:1')).toContain('<u:Pause')
    expect(buildStopEnvelope('urn:x:AVTransport:1')).toContain('<u:Stop')
    expect(buildGetTransportInfoEnvelope('urn:x:AVTransport:1')).toContain('<u:GetTransportInfo')
  })

  it('SetVolume clamps to 0-100 rather than sending whatever it was given', () => {
    expect(buildSetVolumeEnvelope('urn:x:RC:1', { volume: 150 })).toContain('<DesiredVolume>100</DesiredVolume>')
    expect(buildSetVolumeEnvelope('urn:x:RC:1', { volume: -5 })).toContain('<DesiredVolume>0</DesiredVolume>')
    expect(buildSetVolumeEnvelope('urn:x:RC:1', { volume: 42.6 })).toContain('<DesiredVolume>43</DesiredVolume>')
    expect(buildSetVolumeEnvelope('urn:x:RC:1', { volume: 'not a number' })).toContain('<DesiredVolume>0</DesiredVolume>')
  })

  it('GetVolume names the channel', () => {
    expect(buildGetVolumeEnvelope('urn:x:RC:1')).toContain('<Channel>Master</Channel>')
  })
})

describe('castCore — SOAP responses', () => {
  it('detects a SOAP fault and extracts its message', () => {
    const fault = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>
      <s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring>
      <detail><UPnPError><errorCode>701</errorCode><errorDescription>Transition not available</errorDescription></UPnPError></detail>
      </s:Fault></s:Body></s:Envelope>`
    expect(parseSoapFault(fault)).toBe('Transition not available')
  })

  it('falls back to faultstring when there is no errorDescription', () => {
    const fault = '<s:Envelope><s:Body><s:Fault><faultstring>Generic failure</faultstring></s:Fault></s:Body></s:Envelope>'
    expect(parseSoapFault(fault)).toBe('Generic failure')
  })

  it('returns null for a normal (non-fault) response', () => {
    const ok = '<s:Envelope><s:Body><u:PlayResponse xmlns:u="urn:x"/></s:Body></s:Envelope>'
    expect(parseSoapFault(ok)).toBeNull()
    expect(parseSoapFault('')).toBeNull()
    expect(parseSoapFault(null)).toBeNull()
  })

  it('parses transport state and status out of a GetTransportInfo response', () => {
    const xml = '<u:GetTransportInfoResponse xmlns:u="urn:x">'
      + '<CurrentTransportState>PLAYING</CurrentTransportState>'
      + '<CurrentTransportStatus>OK</CurrentTransportStatus>'
      + '<CurrentSpeed>1</CurrentSpeed></u:GetTransportInfoResponse>'
    expect(parseTransportInfoResponse(xml)).toEqual({ state: 'PLAYING', status: 'OK' })
  })

  it('parses a numeric volume, and null when it is missing or non-numeric', () => {
    expect(parseVolumeResponse('<CurrentVolume>37</CurrentVolume>')).toBe(37)
    expect(parseVolumeResponse('<CurrentVolume></CurrentVolume>')).toBeNull()
    expect(parseVolumeResponse('<NoVolumeHere/>')).toBeNull()
  })
})

describe('castCore — isSafeServedName (local file server request-path guard)', () => {
  it('accepts a generated hex name with an extension', () => {
    expect(isSafeServedName('a1b2c3d4e5f6a1b2.mp4')).toBe(true)
  })

  it('rejects path traversal, slashes, and anything not matching a generated name', () => {
    expect(isSafeServedName('../../etc/passwd')).toBe(false)
    expect(isSafeServedName('a/b.mp4')).toBe(false)
    expect(isSafeServedName('..')).toBe(false)
    expect(isSafeServedName('')).toBe(false)
    expect(isSafeServedName(null)).toBe(false)
    expect(isSafeServedName('a'.repeat(200))).toBe(false)
  })
})
