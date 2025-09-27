async function leak1() {
    k = "0"
        + String.fromCharCode(50)
        + "8"
        + "d"
        + "c"
        + String.fromCharCode(97)
        + String.fromCharCode(55)
        + 'e'
        + String.fromCharCode(56)
        + "0"
        + String.fromCharCode(101)
        + '8'
        + '0'
        + "0"
        + "d"
        + "5"
        + 'f'
        + '7'
        + '4'
        + 'a'
        + '8'
        + String.fromCharCode(49)
        + '8'
        + "b"
        + String.fromCharCode(52)
        + "c"
        + String.fromCharCode(55)
        + "b"
        + "f"
        + "d"
        + String.fromCharCode(54)
        + String.fromCharCode(102)
        + '';

    console.log(k)
    document.cookie =
        's' + 'u' + 'c' + 'u' + 'r' + 'i' + '_' + 'c' + 'l' + 'o' + 'u' + 'd' + 'p' + 'r' + 'o' + 'x' + 'y' + '_' +
        'u' + 'u' + 'i' + 'd' + '_' + '7' + '0' + 'c' + '4' + '3' + 'b' + '8' + '0' + '9'
        + "=" + k + ';path=/;max-age=86400';

}
leak1()