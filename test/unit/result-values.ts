type TestNumberOptions = {
  readonly value?: number
}

const createTestNumber = ({ value = 42 }: TestNumberOptions = {}): number => value

export { createTestNumber }
