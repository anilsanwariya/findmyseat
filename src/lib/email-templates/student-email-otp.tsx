import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  code?: string
  siteName?: string
}

const StudentEmailOtp = ({ code = '000000', siteName = 'LibraryBandhu' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {siteName} verification code is {code}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Verify your email</Heading>
        <Text style={text}>
          Use this 6-digit code to verify your email address for {siteName}. It expires in 15 minutes.
        </Text>
        <Section style={codeBox}>
          <Text style={codeText}>{code}</Text>
        </Section>
        <Text style={footer}>
          If you didn't request this code, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: StudentEmailOtp,
  subject: 'Your LibraryBandhu verification code',
  displayName: 'Student email verification OTP',
  previewData: { code: '123456', siteName: 'LibraryBandhu' },
} satisfies TemplateEntry

export default StudentEmailOtp

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '520px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0b0b0f', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 20px' }
const codeBox = {
  background: '#0b0b0f',
  borderRadius: '12px',
  padding: '18px 20px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
}
const codeText = {
  fontSize: '30px',
  fontWeight: 'bold' as const,
  letterSpacing: '8px',
  color: '#ffffff',
  margin: 0,
  fontFamily: 'monospace',
}
const footer = { fontSize: '12px', color: '#999999', margin: '20px 0 0' }
