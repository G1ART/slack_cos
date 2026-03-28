let callJsonFn = null;

export function setCallJson(fn) {
  callJsonFn = fn;
}

export function getCallJson() {
  return callJsonFn;
}
