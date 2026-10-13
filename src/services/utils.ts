/**
 * Converts a given initialValue on a component to an array of numeric IDs.
 * The initialValue can be a single number, a string representing a number, or an array containing numbers and/or strings.
 * */
export function intialValueToNumericIds(initialValue: number | string | Array<number | string>): number[] {
  if (Array.isArray(initialValue)) {
    // If initialValue is an array, convert each element to a number and filter out any non-numeric values (NaN).
    return initialValue.map(Number).filter((id) => !isNaN(id));
  } else {
    // If initialValue is not an array, attempt to convert it to a number.
    const numericValue = Number(initialValue);

    // If the conversion results in a valid number, return it in an array.
    // Otherwise, return an empty array to signify no valid numeric IDs.
    return isNaN(numericValue) ? [] : [numericValue];
  }
}
