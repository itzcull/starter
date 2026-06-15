import { ChakraProvider } from '@chakra-ui/react'
import { ThemeProvider, type ThemeProviderProps } from 'next-themes'
import { system } from '@theme'
import { Toaster } from './toaster'

export function Provider(props: ThemeProviderProps) {
  const { children, ...themeProviderProps } = props

  return (
    <ChakraProvider value={system}>
      <ThemeProvider attribute="class" disableTransitionOnChange {...themeProviderProps}>
        {children}
        <Toaster />
      </ThemeProvider>
    </ChakraProvider>
  )
}
