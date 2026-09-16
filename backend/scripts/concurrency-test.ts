const PRODUCT_ID = 19601;
const CUSTOMER_ID = 2747;

const REQUESTS = 100;

async function createOrder() {
  const response = await fetch(
    "http://localhost:3000/orders",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: CUSTOMER_ID,
        items: [
          {
            product_id: PRODUCT_ID,
            quantity: 1,
          },
        ],
      }),
    }
  );

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function main() {
  console.time("concurrency-test");

  const requests = Array.from(
    { length: REQUESTS },
    () => createOrder()
  );

  const results = await Promise.all(requests);

  console.timeEnd("concurrency-test");

  const success = results.filter(
    (result) => result.status === 201
  ).length;

  const conflicts = results.filter(
    (result) => result.status === 409
  ).length;

  const others = results.filter(
    (result) =>
      result.status !== 201 &&
      result.status !== 409
  );

  console.log("Solicitudes totales:", results.length);
  console.log("Órdenes creadas (201):", success);
  console.log("Sin stock (409):", conflicts);
  console.log("Otros errores:", others.length);

  if (others.length > 0) {
    console.log(others);
  }
}

main().catch(console.error);